// Posts the maintainer-gate check (packages/cli/src/gate.ts) on a pull request's head commit, as
// the Nest bot app, so the ruleset can require that check from that app and nothing else can
// post it. Runs on main's code only (pull_request_target, or workflow_run after a review), never
// on the pull request's. PR_NUMBER names the pull request; without it, HEAD_SHA (the commit a
// review was on) finds every open pull request at that commit.
import { execFileSync } from 'node:child_process'
import { gateDecision, GATE_CHECK } from '../../packages/cli/dist/gate.js'

const { GITHUB_REPOSITORY: repo, PR_NUMBER, HEAD_SHA } = process.env
if (!repo || (!PR_NUMBER && !HEAD_SHA)) {
  console.error('GITHUB_REPOSITORY and PR_NUMBER or HEAD_SHA are required.')
  process.exit(2)
}
const gh = (args, input) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  }).trim()
const api = (path) => JSON.parse(gh(['api', path]))
const paged = (path) => JSON.parse(gh(['api', path, '--paginate', '--slurp'])).flat()

const numbers = PR_NUMBER
  ? [Number(PR_NUMBER)]
  : paged(`repos/${repo}/pulls?state=open&per_page=100`)
      .filter((p) => p.head.sha === HEAD_SHA)
      .map((p) => p.number)
if (numbers.length === 0) console.log(`No open pull request is at ${HEAD_SHA}.`)

const roles = new Map()
const isMaintainer = (login) => {
  if (!roles.has(login)) {
    try {
      roles.set(login, api(`repos/${repo}/collaborators/${login}/permission`).role_name)
    } catch {
      roles.set(login, 'none') // not a collaborator
    }
  }
  return ['admin', 'maintain'].includes(roles.get(login))
}

for (const number of numbers) {
  const pr = api(`repos/${repo}/pulls/${number}`)
  const files = paged(`repos/${repo}/pulls/${number}/files?per_page=100`).map((f) => f.filename)
  const reviews = paged(`repos/${repo}/pulls/${number}/reviews?per_page=100`).map((r) => ({
    login: r.user?.login ?? '',
    state: r.state,
    commitId: r.commit_id ?? '',
    submittedAt: r.submitted_at ?? '',
  }))
  const result = gateDecision({
    files,
    author: pr.user.login,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    reviews,
    isMaintainer,
  })
  gh(
    ['api', '-X', 'POST', `repos/${repo}/check-runs`, '--input', '-'],
    JSON.stringify({
      name: GATE_CHECK,
      head_sha: pr.head.sha,
      status: 'completed',
      conclusion: result.conclusion,
      output: { title: result.title, summary: result.summary },
    }),
  )
  console.log(`#${number} ${pr.head.sha.slice(0, 7)}: ${result.conclusion}, ${result.title}`)
}
