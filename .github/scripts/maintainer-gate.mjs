// Posts the maintainer-gate check (packages/cli/src/gate.ts) on a pull request's head commit, as
// the Nest bot app, so the ruleset can require that check from that app and nothing else can
// post it. Runs on main's code only (pull_request_target, or workflow_run after a review), never
// on the pull request's. PR_NUMBER names the pull request; without it, HEAD_SHA (the commit a
// review was on) finds every open pull request at that commit.
//
// While a shared-file change waits for a maintainer the check is left in progress (pending), not
// failed and not neutral, which would count as passed; and the pull request gets one comment,
// ever, saying a maintainer reviews it and the learner has done nothing wrong. A draft gets the
// comment once it is marked ready.
import {
  gateDecision,
  GATE_CHECK,
  learnerOf,
  WAITING_COMMENT_MARKER,
  waitingComment,
} from '../../packages/cli/dist/gate.js'
import { api, gateInput, gh, maintainerCheck, markedComments, paged, readPullRequest } from './gate-api.mjs'

const { GITHUB_REPOSITORY: repo, PR_NUMBER, HEAD_SHA, NEST_BOT_SLUG } = process.env
if (!repo || !NEST_BOT_SLUG || (!PR_NUMBER && !HEAD_SHA)) {
  console.error('GITHUB_REPOSITORY, NEST_BOT_SLUG, and PR_NUMBER or HEAD_SHA are required.')
  process.exit(2)
}

const numbers = PR_NUMBER
  ? [Number(PR_NUMBER)]
  : paged(`repos/${repo}/pulls?state=open&per_page=100`)
      .filter((p) => p.head.sha === HEAD_SHA)
      .map((p) => p.number)
if (numbers.length === 0) console.log(`No open pull request is at ${HEAD_SHA}.`)

const isMaintainer = maintainerCheck(repo)

for (const number of numbers) {
  const read = readPullRequest(repo, number)
  const { pr } = read
  const result = gateDecision(gateInput(read, isMaintainer))
  const output = { title: result.title, summary: result.summary }
  const state =
    result.conclusion === 'pending'
      ? { status: 'in_progress', output }
      : { status: 'completed', conclusion: result.conclusion, output }
  // An in-progress check this app posted earlier on this commit is updated, not left behind
  // yellow next to a newer one; only when there is none is a new check run created.
  const open = api(
    `repos/${repo}/commits/${pr.head.sha}/check-runs?check_name=${GATE_CHECK}&per_page=100`,
  ).check_runs.filter((r) => r.status !== 'completed' && r.app?.slug === NEST_BOT_SLUG)
  for (const run of open)
    gh(['api', '-X', 'PATCH', `repos/${repo}/check-runs/${run.id}`, '--input', '-'], JSON.stringify(state))
  if (open.length === 0)
    gh(
      ['api', '-X', 'POST', `repos/${repo}/check-runs`, '--input', '-'],
      JSON.stringify({ name: GATE_CHECK, head_sha: pr.head.sha, ...state }),
    )
  console.log(`#${number} ${pr.head.sha.slice(0, 7)}: ${result.conclusion}, ${result.title}`)

  if (result.conclusion !== 'pending' || pr.draft || pr.state !== 'open') continue
  // a maintainer's own shared-file pull request waits for another maintainer, without the comment
  if (isMaintainer(pr.user.login)) continue
  if (markedComments(repo, number, WAITING_COMMENT_MARKER).length > 0) continue
  const learner = learnerOf(pr.user.login, pr.head.ref)
  gh(
    ['api', '-X', 'POST', `repos/${repo}/issues/${number}/comments`, '--input', '-'],
    JSON.stringify({ body: waitingComment(learner) }),
  )
  console.log(`#${number}: told @${learner} a maintainer reviews it.`)
}
