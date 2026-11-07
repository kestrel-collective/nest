import { COHORT_FILE, COHORTS_DIR, CohortSchema, isCohortId, readYaml } from '@nest/schema'
import { UsageError } from '../args.js'
import type { Gh } from '../gh.js'
import type { Io } from '../io.js'
import type { EnrollMode } from './enroll.js'
import { withRetry, type RetryOptions } from '../retry.js'

export type CohortOpenOptions = {
  id: string
  name: string | undefined
  starts: string | undefined
  ends: string | undefined
  mode: EnrollMode
  retry?: RetryOptions
}
export type CohortOpenReport = { id: string; outcome: string; failed: boolean; detail: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDay = (v: string) => DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

/**
 * The name as a quoted YAML scalar the way Prettier (singleQuote) formats one, so the committed
 * file passes npm run lint: single quotes, unless the name has more of them than double quotes.
 */
function yamlQuoted(value: string): string {
  const singles = value.split("'").length - 1
  const doubles = value.split('"').length - 1
  return singles > doubles ? JSON.stringify(value) : `'${value.replaceAll("'", "''")}'`
}

/** The cohort file a new cohort starts with: no members yet; enrolment adds them. */
export function cohortFileText(id: string, name: string, starts: string, ends: string): string {
  return `id: ${id}\nname: ${yamlQuoted(name)}\nstarts: ${starts}\nends: ${ends}\nmembers: []\n`
}

/**
 * Opens a cohort the platform created: writes cohorts/<id>/cohort.yml with no members and
 * commits it straight to main as the bot. An existing file is left as it is, so the command can
 * be run again safely. Kestrel sends it as a repository_dispatch of type "cohort".
 */
export function cohortOpen(opts: CohortOpenOptions, gh: Gh, io: Io): CohortOpenReport {
  const { id, mode } = opts
  const name = opts.name?.trim() ?? ''
  const starts = opts.starts ?? ''
  const ends = opts.ends ?? ''
  if (!isCohortId(id))
    throw new UsageError(
      `The cohort id must be a year and month like 2027-01 or a start date like 2027-01-12, not "${id}".`,
    )
  if (!name) throw new UsageError('cohort-open needs --name "<name>".')
  if (!isDay(starts) || !isDay(ends))
    throw new UsageError('cohort-open needs --starts and --ends as YYYY-MM-DD.')
  if (ends < starts) throw new UsageError(`The cohort ends (${ends}) before it starts (${starts}).`)
  const path = `${COHORTS_DIR}/${id}/${COHORT_FILE}`
  const text = cohortFileText(id, name, starts, ends)
  const parsed = CohortSchema.safeParse(readYaml(text, path).data)
  if (!parsed.success)
    throw new UsageError(`The cohort file would not be valid: ${parsed.error.issues[0]?.message ?? ''}`)

  const done = (outcome: string, detail: string, failed = false): CohortOpenReport => {
    io.out(`cohort ${id}: ${outcome}, ${detail}`)
    return { id, outcome, failed, detail }
  }
  if (mode === 'print') {
    io.out(`# ${path}`)
    io.out(text.trimEnd())
    return done('would create', `${path} on main`)
  }
  if (mode === 'dry-run') return done('would create', `${path} on main, if it does not exist yet`)
  try {
    const result = withRetry(
      'cohort file',
      () =>
        gh.commitToMain({
          message: `chore(cohort): open ${id}`,
          edit: (read) => (read(path) === null ? { [path]: text } : {}),
        }),
      opts.retry,
    )
    return result.action === 'committed'
      ? done('created', `${path} committed to main (${result.sha ?? ''})`)
      : done('skipped', `${path} already exists on main`)
  } catch (error) {
    return done('failed', error instanceof Error ? error.message : String(error), true)
  }
}
