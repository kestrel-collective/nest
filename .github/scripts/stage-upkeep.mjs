// Upkeep of the personal stage issues (see packages/cli/src/stage-upkeep.ts):
//   1. assign each open, unassigned stage issue to its owner once they are a collaborator
//      (enrolment creates the issues while the invitation is pending, and GitHub drops an
//      assignee who has no access yet; Kestrel no longer waits for it on issues the bot
//      opened, D-42, but the assignment keeps GitHub's own views right);
//   2. on every run, put the current kestrel-ticket block from stages/ into every open stage
//      issue whose block differs, so a template change reaches Kestrel with nobody running
//      anything by hand;
//   3. report every open good-shared-issue without stage:5, and fail the run when there is one,
//      so a shared-pool issue opened without its stage label shows up in the Actions tab.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import {
  blockFor,
  handleFromTitle,
  issuesToAssign,
  refreshBody,
  renderBlock,
  SHARED_ISSUE_LABEL,
  sharedIssuesMissingStage,
  stageOf,
  templateBlock,
  templateKey,
  trackOfLabels,
} from '../../packages/cli/dist/stage-upkeep.js'

const repo = process.env.GITHUB_REPOSITORY
if (!repo) {
  console.error('GITHUB_REPOSITORY is required.')
  process.exit(2)
}
const gh = (args, input) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  }).trim()
const repoUrl = `https://github.com/${repo}`

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
    '--limit',
    '500',
    '--json',
    'number,title,body,labels,assignees',
  ]),
).map((i) => ({
  number: i.number,
  title: i.title,
  body: i.body ?? '',
  labels: i.labels.map((l) => l.name),
  assignees: i.assignees.map((a) => a.login),
}))

const known = new Map()
const isCollaborator = (handle) => {
  if (!known.has(handle)) {
    try {
      gh(['api', `repos/${repo}/collaborators/${handle}`])
      known.set(handle, true)
    } catch {
      known.set(handle, false) // 404: not a collaborator yet (the invitation is still pending)
    }
  }
  return known.get(handle)
}

for (const { number, handle } of issuesToAssign(issues, isCollaborator)) {
  gh(['issue', 'edit', String(number), '--repo', repo, '--add-assignee', handle])
  console.log(`Assigned #${number} to @${handle}`)
}

// Every run: an issue whose block is already current is left untouched, so this is cheap
// one block per shared body ("2") and per track variant ("1:python"), ADR 0010
const templates = new Map()
for (const name of readdirSync('stages')) {
  const key = templateKey(name)
  if (key) templates.set(key, templateBlock(readFileSync(`stages/${name}`, 'utf8')))
}
let refreshed = 0
for (const issue of issues) {
  const stage = stageOf(issue.labels)
  const handle = handleFromTitle(issue.title)
  const block = stage === null ? null : blockFor(templates, stage, trackOfLabels(issue.labels))
  if (!block || !handle) continue
  const body = refreshBody(issue.body, renderBlock(block, { handle, repoUrl }))
  if (body === null) continue
  gh(['issue', 'edit', String(issue.number), '--repo', repo, '--body-file', '-'], body)
  console.log(`Refreshed the kestrel-ticket block on #${issue.number}`)
  refreshed += 1
}
console.log(`${issues.length} open stage issue(s) checked, ${refreshed} block(s) refreshed`)

const pool = JSON.parse(
  gh([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--label',
    SHARED_ISSUE_LABEL,
    '--limit',
    '500',
    '--json',
    'number,title,labels',
  ]),
).map((i) => ({ number: i.number, title: i.title, labels: i.labels.map((l) => l.name) }))
const unstaged = sharedIssuesMissingStage(pool)
for (const issue of unstaged) {
  console.log(
    `::error title=Shared issue without stage:5::#${issue.number} (${issue.title}) is labelled ${SHARED_ISSUE_LABEL} but not stage:5. Add the label: gh issue edit ${issue.number} --add-label stage:5`,
  )
}
console.log(`${pool.length} open ${SHARED_ISSUE_LABEL} issue(s) checked, ${unstaged.length} without stage:5`)
if (unstaged.length > 0) process.exitCode = 1
