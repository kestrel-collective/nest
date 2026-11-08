import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_TRACK, stageByNumber, TRACKS, type Stage, type Track } from '@nest/schema'
import { UsageError } from './args.js'
import type { RepoConfig } from './root.js'

export const STAGES_DIR = 'stages'

/** The word that means "no cohort" on the command line and in cohort placeholders. */
export const NO_COHORT = 'none'

export type IssueVars = {
  handle: string
  name?: string | undefined
  /** A cohort id, or NO_COHORT. */
  cohort: string
  /** The member's track (ADR 0010). Default js. */
  track?: Track | undefined
}

export type RenderedIssue = {
  stage: Stage
  title: string
  body: string
  labels: string[]
  milestone: string | undefined
}

/** The title every personal stage issue gets. Enrolment uses it to spot issues that already exist. */
export function issueTitle(stage: Stage, handle: string): string {
  return `Stage ${stage.number}: ${stage.title} (@${handle})`
}

/** onboarding, stage:n and track:<track> always; cohort:<id> only when there is a cohort. */
export function stageLabels(stage: Stage, cohort: string, track: Track = DEFAULT_TRACK): string[] {
  const labels = ['onboarding']
  if (cohort !== NO_COHORT) labels.push(`cohort:${cohort}`)
  labels.push(`stage:${stage.number}`, `track:${track}`)
  return labels
}

/** The track a stage template is written for: stages/01-make-it-run.python.md is python, 02-*.md is shared. */
export function templateTrack(file: string): Track | null {
  const m = /\.([a-z]+)\.md$/.exec(file)
  return m && (TRACKS as readonly string[]).includes(m[1]!) ? (m[1] as Track) : null
}

/**
 * Finds the issue body for a stage: stages/0N-<slug>.<track>.md when the stage reads differently on
 * each track (1, 3, 4 and 5), otherwise the shared stages/0N-<slug>.md.
 */
export function stageFile(root: string, n: number, track: Track = DEFAULT_TRACK): string {
  const dir = join(root, STAGES_DIR)
  if (!existsSync(dir)) throw new UsageError(`The ${STAGES_DIR}/ directory is missing.`)
  const prefix = `${String(n).padStart(2, '0')}-`
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .sort()
  const file = files.find((f) => templateTrack(f) === track) ?? files.find((f) => templateTrack(f) === null)
  if (!file)
    throw new UsageError(
      `No issue body for stage ${n} on the ${track} track in ${STAGES_DIR}/ (expected ${prefix}<slug>.${track}.md or ${prefix}<slug>.md).`,
    )
  return join(dir, file)
}

/**
 * Words that differ by track in the shared stage bodies (2, 6 and 7), filled like any placeholder:
 * {{validate_command}}, {{test_command}}, {{see_your_page}} and {{see_their_page}}.
 */
export function trackVars(track: Track, handle: string): Record<string, string> {
  if (track === 'python')
    return {
      track,
      track_name: 'python',
      validate_command: '`nest validate`',
      test_command: '`pytest`',
      see_your_page: `run \`nest page-status ${handle} --local\`: it says whether the site would build your page from your working copy, and names anything in the way. You will read the page itself on the pull request's preview in a moment, without Node.`,
      see_their_page: 'open the Cloudflare preview link on their pull request',
    }
  return {
    track,
    track_name: 'js',
    validate_command: '`npm run validate`',
    test_command: '`npm test`',
    see_your_page: `run \`npm run dev\` and open http://localhost:4321/p/${handle}/ in your browser. Edit, save, reload, until it reads right. Press Ctrl+C in the terminal to stop.`,
    see_their_page: '`npm run dev` and open http://localhost:4321/p/<their-handle>/',
  }
}

export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => vars[key] ?? match)
}

export function templateVars(
  config: RepoConfig,
  vars: IssueVars,
  extra: Record<string, string> = {},
): Record<string, string> {
  const cohort = vars.cohort
  return {
    ...trackVars(vars.track ?? DEFAULT_TRACK, vars.handle),
    handle: vars.handle,
    name: vars.name ?? `@${vars.handle}`,
    cohort,
    cohort_phrase: cohort === NO_COHORT ? '' : `, for cohort ${cohort}`,
    repo: config.slug,
    repo_url: config.repoUrl,
    site: config.siteUrl,
    ...extra,
  }
}

export function renderIssue(config: RepoConfig, stageNumber: number, vars: IssueVars): RenderedIssue {
  const stage = stageByNumber(stageNumber)
  if (!stage) throw new UsageError(`Stage must be a number from 1 to 7, not "${stageNumber}".`)
  const track = vars.track ?? DEFAULT_TRACK
  const template = readFileSync(stageFile(config.root, stage.number, track), 'utf8')
  const body = fillTemplate(
    template,
    templateVars(config, vars, { stage_title: stage.title, stage_number: String(stage.number) }),
  )
  return {
    stage,
    title: issueTitle(stage, vars.handle),
    body,
    labels: stageLabels(stage, vars.cohort, track),
    milestone: vars.cohort === NO_COHORT ? undefined : vars.cohort,
  }
}
