// The shared-pool backlog: reading docs/backlog-seed.md and the labels and gh arguments each issue is
// opened with. scripts/open-backlog.mjs is the command; this module is what scripts/backlog.test.ts tests.

/** The pool label. Every issue opened with it is a Stage 5 issue too (stages/README.md). */
export const SHARED_ISSUE_LABEL = 'good-shared-issue'
/** The stage label every shared-pool issue carries; SHARED_STAGE in @nest/schema is 5. */
export const SHARED_STAGE_LABEL = 'stage:5'

/** The labels a shared-pool issue on this track is created with. */
export function issueLabels(track) {
  return [SHARED_ISSUE_LABEL, SHARED_STAGE_LABEL, `track:${track}`]
}

/** Every level-two section of the seed file as { title, body: string[], track }. */
export function parseBacklog(text) {
  const issues = []
  let current = null
  for (const line of text.split('\n')) {
    const m = /^## (.+)$/.exec(line)
    if (m) {
      if (current) issues.push(current)
      current = { title: m[1].trim(), body: [], track: null }
      continue
    }
    const t = /^Track: (js|python)\s*$/.exec(line)
    if (current && t && current.track === null) {
      current.track = t[1]
      continue
    }
    if (current) current.body.push(line.replace(/^### /, '## '))
  }
  if (current) issues.push(current)
  return issues
}

/** The issue body, with the note on its first line when one is given. */
export function issueBody(issue, note) {
  const own = issue.body.join('\n').trim() + '\n'
  return note ? `${note}\n\n${own}` : own
}

/** The gh arguments that create this issue; the body goes on standard input. */
export function createArgs(repo, issue) {
  const labels = issueLabels(issue.track).flatMap((label) => ['--label', label])
  return ['issue', 'create', '--repo', repo, '--title', issue.title, ...labels, '--body-file', '-']
}
