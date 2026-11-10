// Decides whether a pull request may merge on its own. Runs on the base branch; the list of
// changed files comes from the API, so the pull request's code is never executed here.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { checkOwnDirectoryChange } from '../../packages/cli/dist/paths.js'

const { PR_NUMBER, PR_AUTHOR, PR_HEAD, GITHUB_REPOSITORY, GITHUB_OUTPUT } = process.env
if (!PR_NUMBER || !PR_AUTHOR || !GITHUB_REPOSITORY) {
  console.error('PR_NUMBER, PR_AUTHOR and GITHUB_REPOSITORY are required.')
  process.exit(2)
}

const out = execFileSync(
  'gh',
  [
    'api',
    `repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files?per_page=100`,
    '--paginate',
    '--jq',
    '.[].filename',
  ],
  { encoding: 'utf8' },
)
const files = out.split('\n').filter(Boolean)
// PR_HEAD, the head branch, matters only for a scaffold pull request from the Nest bot app
const result = checkOwnDirectoryChange(files, PR_AUTHOR, PR_HEAD ?? '')

const lines = [`own=${result.ok}`]
if (!result.ok) lines.push(`reason=${result.reason}`)
if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `${lines.join('\n')}\n`)
console.log(
  result.ok
    ? `Own directory of @${result.handle}: ${files.length} file(s). Auto-merge enabled.`
    : result.reason,
)
