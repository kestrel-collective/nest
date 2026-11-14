// Lists the open pull requests that have waited more than a day for a maintainer
// (packages/cli/src/maintainer-queue.ts): in one pinned issue, which it rewrites each day, or,
// when NEST_DISCORD_WEBHOOK is set, in a Discord message instead. It decides each pull request
// with the same gateDecision as the maintainer-gate check, rather than reading the check back.
import { gateDecision, learnerOf, WAITING_COMMENT_MARKER } from '../../packages/cli/dist/gate.js'
import {
  discordMessage,
  overdue,
  QUEUE_MARKER,
  QUEUE_TITLE,
  queueIssueBody,
  waitingSince,
} from '../../packages/cli/dist/maintainer-queue.js'
import { gateInput, gh, maintainerCheck, markedComments, paged, readPullRequest } from './gate-api.mjs'

const { GITHUB_REPOSITORY: repo, NEST_DISCORD_WEBHOOK: webhook } = process.env
if (!repo) {
  console.error('GITHUB_REPOSITORY is required.')
  process.exit(2)
}
const now = Date.now()
const isMaintainer = maintainerCheck(repo)

const waiting = []
for (const pr of paged(`repos/${repo}/pulls?state=open&per_page=100`)) {
  if (pr.draft) continue
  const read = readPullRequest(repo, pr)
  if (gateDecision(gateInput(read, isMaintainer)).conclusion !== 'pending') continue
  const author = pr.user.login.toLowerCase()
  waiting.push({
    number: pr.number,
    title: pr.title,
    author: learnerOf(pr.user.login, pr.head.ref),
    url: pr.html_url,
    waitingSince: waitingSince({
      createdAt: pr.created_at,
      commentAt: markedComments(repo, pr.number, WAITING_COMMENT_MARKER)[0]?.created_at,
      maintainerReviewsAt: read.reviews
        .filter((r) => r.login.toLowerCase() !== author && isMaintainer(r.login))
        .map((r) => r.submittedAt),
    }),
  })
}
const late = overdue(waiting, now)
console.log(`${waiting.length} pull request(s) wait for a maintainer, ${late.length} for more than a day.`)

if (webhook) {
  const content = discordMessage(late, now)
  if (!content) process.exit(0)
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  })
  if (!res.ok) {
    console.error(`::error title=Discord webhook failed::${res.status} ${await res.text()}`)
    process.exit(1)
  }
  console.log('Posted the queue to Discord.')
  process.exit(0)
}

// The one queue issue: opened by this workflow's token, and recognised by its marker.
const existing = paged(
  `repos/${repo}/issues?state=open&creator=${encodeURIComponent('github-actions[bot]')}&per_page=100`,
).find((i) => !i.pull_request && i.body?.includes(QUEUE_MARKER))
if (!existing && late.length === 0) {
  console.log('No queue issue yet, and nothing to put in one.')
  process.exit(0)
}
const body = queueIssueBody(late, now)
const issue = existing
  ? JSON.parse(
      gh(
        ['api', '-X', 'PATCH', `repos/${repo}/issues/${existing.number}`, '--input', '-'],
        JSON.stringify({ body }),
      ),
    )
  : JSON.parse(
      gh(
        ['api', '-X', 'POST', `repos/${repo}/issues`, '--input', '-'],
        JSON.stringify({ title: QUEUE_TITLE, body }),
      ),
    )
console.log(`${existing ? 'Updated' : 'Opened'} #${issue.number}.`)

const [owner, name] = repo.split('/')
const graphql = (query, vars) =>
  JSON.parse(
    gh([
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      ...Object.entries(vars).flatMap(([k, v]) => [typeof v === 'number' ? '-F' : '-f', `${k}=${v}`]),
    ]),
  ).data
const { isPinned } = graphql(
  'query($o:String!,$n:String!,$i:Int!){repository(owner:$o,name:$n){issue(number:$i){isPinned}}}',
  { o: owner, n: name, i: issue.number },
).repository.issue
if (!isPinned) {
  try {
    graphql('mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{number}}}', { id: issue.node_id })
    console.log(`Pinned #${issue.number}.`)
  } catch (e) {
    // A repository pins three issues at most; the list is still in the issue.
    console.log(
      `::warning title=Queue issue not pinned::Could not pin #${issue.number}: ${String(e.message ?? e).trim()}`,
    )
  }
}
