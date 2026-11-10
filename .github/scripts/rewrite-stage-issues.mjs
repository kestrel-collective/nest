// Rewrites the body of every open personal stage issue of one stage from its current template in
// stages/, the same rendering enrolment uses (renderIssue), for issues opened from older text.
// The kestrel-ticket block comes along with the text; every key that is not an instruction
// (competency, level, difficulty, kp, evidence_kind, reserved_for, stage) must come out the same,
// and the block must keep every key Kestrel requires, or that issue is refused and left as it is.
// Usage: node .github/scripts/rewrite-stage-issues.mjs --stage 2 [--apply] [--repo owner/name]
// Without --apply it only lists what it would change. Run from the repository root after `npx tsc -b`.
import { execFileSync } from 'node:child_process'
import { renderIssue } from '../../packages/cli/dist/issue-body.js'
import { readConfig } from '../../packages/cli/dist/root.js'
import { checkTicketRewrite, stageIssueVars } from '../../packages/cli/dist/stage-upkeep.js'

const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const apply = args.includes('--apply')
const stage = Number(flag('--stage'))
const repo = flag('--repo') ?? process.env.GITHUB_REPOSITORY
if (!Number.isInteger(stage) || stage < 1 || stage > 7 || !repo) {
  console.error('Usage: rewrite-stage-issues.mjs --stage <1-7> [--apply] [--repo owner/name]')
  process.exit(2)
}

const gh = (ghArgs, input) =>
  execFileSync('gh', ghArgs, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  }).trim()
const config = readConfig(process.cwd())
const normal = (text) => text.replace(/\r\n/g, '\n').trimEnd()

const issues = JSON.parse(
  gh([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--label',
    'onboarding',
    '--label',
    `stage:${stage}`,
    '--limit',
    '500',
    '--json',
    'number,title,body,labels',
  ]),
).map((i) => ({ ...i, body: i.body ?? '', labels: i.labels.map((l) => l.name) }))

let changes = 0
let refused = 0
for (const issue of issues.sort((a, b) => a.number - b.number)) {
  const vars = stageIssueVars(issue)
  if (!vars) {
    console.log(`Skipped #${issue.number} ${issue.title}: not a personal stage issue`)
    continue
  }
  const body = renderIssue(config, stage, vars).body
  if (normal(body) === normal(issue.body)) {
    console.log(`Current #${issue.number} ${issue.title}`)
    continue
  }
  const why = checkTicketRewrite(issue.body, body)
  if (why) {
    console.log(`::error title=Not rewritten::#${issue.number} ${issue.title}: ${why}`)
    refused += 1
    continue
  }
  const was = normal(issue.body).split('\n')
  const now = normal(body).split('\n')
  const removed = was.filter((l) => !now.includes(l)).length
  const added = now.filter((l) => !was.includes(l)).length
  const who = `@${vars.handle}, ${vars.track} track, cohort ${vars.cohort}, "${vars.name}"`
  if (apply) {
    gh(['issue', 'edit', String(issue.number), '--repo', repo, '--body-file', '-'], `${normal(body)}\n`)
    console.log(`Rewrote #${issue.number} ${issue.title} (${who}): ${removed} line(s) out, ${added} in`)
  } else {
    console.log(`Would rewrite #${issue.number} ${issue.title} (${who}): ${removed} line(s) out, ${added} in`)
  }
  changes += 1
}
console.log(
  `${issues.length} open stage:${stage} issue(s); ${changes} ${apply ? 'rewritten' : 'would be rewritten'}, ${refused} refused.` +
    (apply || changes === 0 ? '' : ' Add --apply to write them.'),
)
if (refused > 0) process.exitCode = 1
