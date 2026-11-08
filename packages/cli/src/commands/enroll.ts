import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COHORT_FILE,
  COHORTS_DIR,
  DEFAULT_TRACK,
  explainHandle,
  isCohortId,
  SHARED_STAGE,
  type Track,
} from '@nest/schema'
import { UsageError } from '../args.js'
import type { Gh } from '../gh.js'
import { cohortMemberTrack } from '../enroll-files.js'
import type { Io } from '../io.js'
import { runPythonScaffold, type PythonScaffold } from '../python-scaffold.js'
import { NO_COHORT } from '../issue-body.js'
import { withRetry, type RetryOptions } from '../retry.js'
import type { RepoConfig } from '../root.js'
import { stepCohortFiles, stepInvite, stepIssues, stepScaffold } from './enroll-steps.js'

export type EnrollMode = 'print' | 'dry-run' | 'apply'

export type EnrollOptions = {
  handle: string
  name?: string | undefined
  /** A cohort id or "none". */
  cohort: string
  /** The member's track (ADR 0010). Left out: the track the cohort file records, else js. */
  track?: Track | undefined
  mode: EnrollMode
  /** Writes a python-track scaffold. Tests pass a fake; the default runs nest_data. */
  pythonScaffold?: PythonScaffold | undefined
  today?: string | undefined
  retry?: RetryOptions | undefined
}

export type StepId = 'a' | 'b' | 'c' | 'd'
export type StepOutcome = 'created' | 'updated' | 'skipped' | 'failed' | 'would create' | 'would update'
export type StepResult = { step: StepId; outcome: StepOutcome; detail: string }

export type EnrollReport = {
  handle: string
  cohort: string
  track: Track
  steps: StepResult[]
  failed: boolean
  scaffolded: boolean
  issuesCreated: string[]
  issuesSkipped: string[]
  invitation: string
  /** The commit on main that added the person to their cohort, when one was made. */
  cohortCommit: string | null
}

export type EnrollContext = {
  config: RepoConfig
  opts: EnrollOptions & { track: Track; pythonScaffold: PythonScaffold }
  gh: Gh
  io: Io
  report: EnrollReport
  retry: <T>(label: string, fn: () => T) => T
  done: (step: StepId, outcome: StepOutcome, detail: string) => void
}

const STEP_LABELS: Record<StepId, string> = {
  a: 'cohort files',
  b: 'scaffold',
  c: 'invitation',
  d: 'stage issues',
}

export const scaffoldBranch = (handle: string) => `scaffold/${handle}`
export const scaffoldPrTitle = (handle: string) => `Scaffold for @${handle}`
/** The branch cohort pull requests came from before membership was committed to main; withdraw still closes one. */
export const enrollBranch = (handle: string) => `bot/enroll-${handle}`
export const enrollCommitMessage = (handle: string, cohort: string) =>
  `chore(cohort): add @${handle} to ${cohort}`

/**
 * Enrols one person: cohort files, scaffold pull request, collaborator invitation, personal
 * stage issues. Every step is idempotent, so the command can be run again after a failure
 * and performs only what is still missing. open-cohort calls this once per member.
 */
export function enroll(config: RepoConfig, opts: EnrollOptions, gh: Gh, io: Io): EnrollReport {
  const handle = opts.handle.toLowerCase()
  const why = explainHandle(handle)
  if (why) throw new UsageError(`The handle ${why}`)
  let cohort = opts.cohort
  if (cohort !== NO_COHORT) {
    if (!isCohortId(cohort))
      throw new UsageError(
        `The cohort must be a year and month like 2027-01, a start date like 2027-01-12, or "none", not "${cohort}".`,
      )
    if (!existsSync(join(config.root, COHORTS_DIR, cohort, COHORT_FILE))) {
      // The platform may enrol someone into a cohort this repository has not opened yet. They are
      // not held back: they start as an individual joiner, and open-cohort adds them to the cohort
      // once its file is merged.
      io.out(
        `cohorts/${cohort}/${COHORT_FILE} does not exist yet, so @${handle} is enrolled as an individual joiner; ` +
          `run open-cohort ${cohort} once the cohort file is merged to add them to it.`,
      )
      cohort = NO_COHORT
    }
  }

  const recorded =
    cohort === NO_COHORT
      ? null
      : cohortMemberTrack(readRepoFile(config.root, `${COHORTS_DIR}/${cohort}/${COHORT_FILE}`), handle)
  const track: Track = opts.track ?? recorded ?? DEFAULT_TRACK
  const report: EnrollReport = {
    handle,
    cohort,
    track,
    steps: [],
    failed: false,
    scaffolded: false,
    issuesCreated: [],
    issuesSkipped: [],
    invitation: 'not checked',
    cohortCommit: null,
  }
  const ctx: EnrollContext = {
    config,
    opts: { ...opts, handle, cohort, track, pythonScaffold: opts.pythonScaffold ?? runPythonScaffold },
    gh,
    io,
    report,
    retry: (label, fn) =>
      withRetry(label, fn, {
        ...opts.retry,
        onRetry: (attempt, error, delay) => {
          const message = error instanceof Error ? error.message : String(error)
          io.err(`  ${label}: attempt ${attempt} failed (${message}); retrying in ${delay} ms`)
        },
      }),
    done: (step, outcome, detail) => {
      report.steps.push({ step, outcome, detail })
      if (outcome === 'failed') report.failed = true
      io.out(`${step}. ${STEP_LABELS[step]}: ${outcome}${detail ? `, ${detail}` : ''}`)
    },
  }

  const steps: [StepId, (ctx: EnrollContext) => void][] = [
    ['a', stepCohortFiles],
    ['b', stepScaffold],
    ['c', stepInvite],
    ['d', stepIssues],
  ]
  for (const [id, step] of steps) {
    try {
      step(ctx)
    } catch (error) {
      if (error instanceof UsageError) throw error
      ctx.done(id, 'failed', error instanceof Error ? error.message : String(error))
    }
  }
  io.out(
    `Stage ${SHARED_STAGE} is not a personal issue. @${handle} claims one labelled good-shared-issue and track:${track}.`,
  )
  return report
}

export function readRepoFile(root: string, rel: string): string {
  const path = join(root, rel)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}
