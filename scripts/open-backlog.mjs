#!/usr/bin/env node
// Opens every issue in docs/backlog-seed.md as a good-shared-issue, labelled stage:5 and with the track
// its "Track:" line names (ADR 0010; the labels are in scripts/backlog.mjs). Dry run unless --gh is given.
// Usage: node scripts/open-backlog.mjs [--gh] [--repo owner/name] [--track js|python] [--note "text"]
// --note puts one line at the top of every body, for example while the code it needs is still in review.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createArgs, issueBody, issueLabels, parseBacklog } from './backlog.mjs'

const args = process.argv.slice(2)
const apply = args.includes('--gh')
const repoFlag = args.indexOf('--repo')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const repo = repoFlag >= 0 ? args[repoFlag + 1] : pkg.repository.replace(/^github:/, '')
const flag = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined)
const onlyTrack = flag('--track')
const note = flag('--note')
if (onlyTrack && !['js', 'python'].includes(onlyTrack)) {
  console.error('--track must be js or python.')
  process.exit(2)
}

const issues = parseBacklog(readFileSync(new URL('../docs/backlog-seed.md', import.meta.url), 'utf8'))

if (issues.length === 0) {
  console.error('No issues found under level-two headings in docs/backlog-seed.md.')
  process.exit(2)
}
const untracked = issues.filter((i) => i.track === null)
if (untracked.length > 0) {
  console.error(
    `Every issue needs a Track: js or Track: python line: ${untracked.map((i) => i.title).join('; ')}`,
  )
  process.exit(2)
}
const chosen = onlyTrack ? issues.filter((i) => i.track === onlyTrack) : issues

const existing = apply
  ? JSON.parse(
      execFileSync(
        'gh',
        ['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '500', '--json', 'title'],
        { encoding: 'utf8' },
      ),
    ).map((i) => i.title.toLowerCase())
  : []

let created = 0
for (const issue of chosen) {
  const body = issueBody(issue, note)
  if (existing.includes(issue.title.toLowerCase())) {
    console.log(`Skipped (exists): ${issue.title}`)
    continue
  }
  if (!apply) {
    console.log(
      `Would create: ${issue.title} (${body.length} characters, labels ${issueLabels(issue.track).join(', ')})`,
    )
    continue
  }
  const url = execFileSync('gh', createArgs(repo, issue), { input: body, encoding: 'utf8' }).trim()
  console.log(`Created ${url}: ${issue.title}`)
  created += 1
}
console.log(
  apply
    ? `${created} issue(s) created in ${repo}.`
    : `${chosen.length} issue(s) would be created in ${repo}. Add --gh to create them.`,
)
