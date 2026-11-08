import { trackOf, validateCohort } from '@nest/schema'
import { UsageError } from '../args.js'
import type { Gh } from '../gh.js'
import type { Io } from '../io.js'
import type { RetryOptions } from '../retry.js'
import type { RepoConfig } from '../root.js'
import { enroll, type EnrollMode, type EnrollReport } from './enroll.js'
import { contributorName } from './new-task.js'

export type OpenCohortMode = EnrollMode

export type OpenCohortOptions = {
  id: string
  mode: OpenCohortMode
  today?: string | undefined
  retry?: RetryOptions | undefined
}

export type OpenCohortReport = {
  scaffolded: string[]
  scaffoldSkipped: string[]
  issuesCreated: string[]
  issuesSkipped: string[]
  failed: string[]
  enrolled: EnrollReport[]
}

export { scaffoldBranch, scaffoldPrTitle } from './enroll.js'

/**
 * Opens a cohort: enrols every member in cohort.yml, one after the other, with the same
 * steps a single `nest enroll` performs. Safe to run again: anything that exists is skipped.
 */
export function openCohort(config: RepoConfig, opts: OpenCohortOptions, gh: Gh, io: Io): OpenCohortReport {
  const { cohort, issues } = validateCohort(config.root, opts.id)
  if (!cohort) {
    throw new UsageError(
      `cohorts/${opts.id}/cohort.yml is missing or invalid. Run nest validate for details. ${issues[0]?.message ?? ''}`.trim(),
    )
  }
  const report: OpenCohortReport = {
    scaffolded: [],
    scaffoldSkipped: [],
    issuesCreated: [],
    issuesSkipped: [],
    failed: [],
    enrolled: [],
  }
  for (const handle of cohort.members) {
    io.out(`# @${handle}`)
    const r = enroll(
      config,
      {
        handle,
        name: contributorName(config, handle),
        cohort: cohort.id,
        track: trackOf(cohort, handle),
        mode: opts.mode,
        today: opts.today,
        retry: opts.retry,
      },
      gh,
      io,
    )
    report.enrolled.push(r)
    const scaffoldStep = r.steps.find((s) => s.step === 'b')
    if (scaffoldStep && scaffoldStep.outcome !== 'skipped' && scaffoldStep.outcome !== 'failed')
      report.scaffolded.push(handle)
    else report.scaffoldSkipped.push(handle)
    report.issuesCreated.push(...r.issuesCreated)
    report.issuesSkipped.push(...r.issuesSkipped)
    if (r.failed) report.failed.push(handle)
    io.out('')
  }
  const apply = opts.mode === 'apply'
  io.out(
    `${apply ? 'Done' : 'Dry run'}: ${report.scaffolded.length} scaffold${report.scaffolded.length === 1 ? '' : 's'}, ${report.issuesCreated.length} issue${report.issuesCreated.length === 1 ? '' : 's'}${apply ? ' created' : ' to create'}, ${report.scaffoldSkipped.length + report.issuesSkipped.length} skipped${report.failed.length ? `, ${report.failed.length} failed` : ''}.`,
  )
  return report
}
