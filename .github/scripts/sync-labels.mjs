// Creates or updates every label in .github/labels.json. Cohort labels are created by nest open-cohort.
// A label that fails does not stop the rest: every failure is listed at the end and the run exits 1.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Runs `create(label)` for every label, carrying on past a failure, and returns
 * { synced: names, failed: [{ name, reason }] }.
 */
export function syncLabels(labels, create) {
  const synced = []
  const failed = []
  for (const label of labels) {
    try {
      create(label)
      synced.push(label.name)
    } catch (err) {
      const reason =
        String(err?.stderr || err?.message || err)
          .trim()
          .split('\n')[0] || 'unknown error'
      failed.push({ name: label.name, reason })
    }
  }
  return { synced, failed }
}

/** The closing report, and the exit code: 0 when every label synced, 1 when any failed. */
export function report({ synced, failed }) {
  const lines = [`${synced.length} label(s) synced.`]
  if (failed.length > 0) {
    lines.push(`${failed.length} label(s) failed:`)
    for (const f of failed) lines.push(`- ${f.name}: ${f.reason}`)
  }
  return { lines, code: failed.length > 0 ? 1 : 0 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) {
    console.error('GITHUB_REPOSITORY is required.')
    process.exit(2)
  }
  const labels = JSON.parse(readFileSync(new URL('../labels.json', import.meta.url), 'utf8'))
  const result = syncLabels(labels, (label) =>
    execFileSync(
      'gh',
      [
        'label',
        'create',
        label.name,
        '--repo',
        repo,
        '--color',
        label.color,
        '--description',
        label.description,
        '--force',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  )
  const { lines, code } = report(result)
  for (const f of result.failed) console.log(`::error title=Label not synced::${f.name}: ${f.reason}`)
  console.log(lines.join('\n'))
  process.exitCode = code
}
