import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COHORT_FILE,
  COHORTS_DIR,
  CONTRIBUTORS_DIR,
  DEFAULT_TRACK,
  isPlaceholder,
  listCohortIds,
  validateContributor,
  type Track,
} from '@nest/schema'
import { UsageError } from '../args.js'
import { LABEL_COLORS, type Gh } from '../gh.js'
import { cohortMemberTrack } from '../enroll-files.js'
import type { Io } from '../io.js'
import { NO_COHORT, renderIssue, type RenderedIssue } from '../issue-body.js'
import type { RepoConfig } from '../root.js'

export type NewTaskOptions = {
  stage: number
  handle: string
  cohort?: string | undefined
  /** Left out: the track the cohort file records, else the track the directory's test file shows, else js. */
  track?: Track | undefined
  dryRun?: boolean | undefined
}

/** The display name from the contributor directory, when it exists and is filled in. */
export function contributorName(config: RepoConfig, handle: string): string | undefined {
  if (!existsSync(join(config.root, CONTRIBUTORS_DIR, handle))) return undefined
  const c = validateContributor(config.root, handle).contributor
  return c && !isPlaceholder(c.profile.name) ? c.profile.name : undefined
}

/**
 * The member's track: the one their cohort file records; for an individual joiner, python when their
 * directory holds the python track's test file; otherwise js (ADR 0010).
 */
export function contributorTrack(config: RepoConfig, handle: string, cohort: string): Track {
  if (cohort !== NO_COHORT) {
    const path = join(config.root, COHORTS_DIR, cohort, COHORT_FILE)
    const recorded = existsSync(path) ? cohortMemberTrack(readFileSync(path, 'utf8'), handle) : null
    if (recorded) return recorded
  }
  return existsSync(join(config.root, CONTRIBUTORS_DIR, handle, 'test_profile.py')) ? 'python' : DEFAULT_TRACK
}

/** Looks up the name and cohort from the contributor directory when it exists. */
export function contributorVars(
  config: RepoConfig,
  handle: string,
  cohort: string | undefined,
): { name?: string; cohort: string } {
  const name = contributorName(config, handle)
  if (cohort === undefined && existsSync(join(config.root, CONTRIBUTORS_DIR, handle))) {
    cohort = validateContributor(config.root, handle).contributor?.profile.cohort
  }
  if (cohort === undefined) {
    const ids = listCohortIds(config.root)
    if (ids.length === 1) cohort = ids[0]
  }
  if (cohort === undefined)
    throw new UsageError(`No cohort known for ${handle}. Pass --cohort <id>, or --cohort ${NO_COHORT}.`)
  return name === undefined ? { cohort } : { name, cohort }
}

export function ensureIssueLabels(gh: Gh, issue: RenderedIssue, io: Io): void {
  for (const label of issue.labels) {
    const kind = label.split(':')[0] ?? label
    const color = LABEL_COLORS[kind] ?? '6E7781'
    const description =
      kind === 'onboarding'
        ? 'Personal onboarding issue'
        : kind === 'stage'
          ? `Stage ${label.split(':')[1]} of the ladder`
          : kind === 'track'
            ? `The ${label.split(':')[1]} track (ADR 0010)`
            : `Cohort ${label.split(':')[1]}`
    if (gh.ensureLabel(label, color, description) === 'created') io.out(`Created label ${label}`)
  }
}

/** Prints the issue, or creates it when a gh client is given. */
export function runNewTask(config: RepoConfig, opts: NewTaskOptions, gh: Gh | null, io: Io): number {
  const vars = contributorVars(config, opts.handle, opts.cohort)
  const track = opts.track ?? contributorTrack(config, opts.handle, vars.cohort)
  const issue = renderIssue(config, opts.stage, { handle: opts.handle, ...vars, track })
  const milestone = issue.milestone ?? 'none'
  if (!gh) {
    io.out(`# ${issue.title}`)
    io.out(`Labels: ${issue.labels.join(', ')}. Assignee: ${opts.handle}. Milestone: ${milestone}.`)
    io.out('')
    io.out(issue.body.trimEnd())
    return 0
  }
  if (opts.dryRun) {
    io.out(
      `Would create issue "${issue.title}" with labels ${issue.labels.join(', ')}, assignee ${opts.handle}, milestone ${milestone}.`,
    )
    return 0
  }
  const existing = gh.listIssueTitles(opts.handle)
  if (existing.some((t) => t.toLowerCase() === issue.title.toLowerCase())) {
    io.out(`Skipped: "${issue.title}" already exists for ${opts.handle}.`)
    return 0
  }
  if (issue.milestone && gh.ensureMilestone(issue.milestone) === 'created')
    io.out(`Created milestone ${issue.milestone}`)
  ensureIssueLabels(gh, issue, io)
  const url = gh.createIssue({
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
    assignee: opts.handle,
    milestone: issue.milestone,
  })
  io.out(`Created ${url}`)
  return 0
}
