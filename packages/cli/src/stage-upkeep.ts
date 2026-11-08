/**
 * Upkeep of the personal stage issues, run by the stage-upkeep job in .github/workflows/onboarding.yml.
 *
 * Assigning: enrolment creates the stage issues while the collaborator invitation is still
 * pending, and GitHub drops an assignee who has no access yet. Kestrel reserves a stage
 * ticket only for the issue's assignee, so once the person is a collaborator their open,
 * unassigned stage issues are assigned to them.
 *
 * Refreshing: the kestrel-ticket block at the end of each stage template is the machine
 * summary Kestrel reads. When a template's block changes, refreshBody puts the new block
 * into issues that were created from the old one.
 *
 * Checking the pool: every open good-shared-issue must carry stage:5 and a track label, and each
 * track needs POOL_MINIMUM open ones; checkSharedPool names what is wrong, and the job fails on it.
 */

import { SHARED_STAGE, TRACKS, type Track } from '@nest/schema'

export type OpenStageIssue = {
  number: number
  title: string
  body: string
  labels: string[]
  assignees: string[]
}

const HANDLE_IN_TITLE = /\(@([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\)\s*$/i
const BLOCK = /```kestrel-ticket\n[\s\S]*?\n```/

/** The handle a personal stage issue belongs to, from the "(@handle)" at the end of its title. */
export function handleFromTitle(title: string): string | null {
  return HANDLE_IN_TITLE.exec(title)?.[1]?.toLowerCase() ?? null
}

/** The stage number from a "stage:N" label, or null. */
export function stageOf(labels: readonly string[]): number | null {
  for (const label of labels) {
    const m = /^stage:(\d)$/.exec(label)
    if (m) return Number(m[1])
  }
  return null
}

/** The track a stage issue was opened for, from its "track:<name>" label; js when it has none (ADR 0010). */
export function trackOfLabels(labels: readonly string[]): 'js' | 'python' {
  return labels.includes('track:python') ? 'python' : 'js'
}

/**
 * The template block for an issue: the variant for its track when the stage has one, else the shared
 * body's. Keys are "<stage>" for a shared body and "<stage>:<track>" for a variant.
 */
export function blockFor(
  templates: ReadonlyMap<string, string | null>,
  stage: number,
  track: 'js' | 'python',
): string | null {
  return templates.get(`${stage}:${track}`) ?? templates.get(String(stage)) ?? null
}

/** The key for a stage file name: "1:python" for 01-make-it-run.python.md, "2" for 02-your-page-exists.md. */
export function templateKey(name: string): string | null {
  const m = /^(\d\d)-[a-z0-9-]+(?:\.(js|python))?\.md$/.exec(name)
  if (!m) return null
  return m[2] ? `${Number(m[1])}:${m[2]}` : String(Number(m[1]))
}

/** Open stage issues with no assignee whose owner is now a collaborator. */
export function issuesToAssign(
  issues: readonly OpenStageIssue[],
  isCollaborator: (handle: string) => boolean,
): { number: number; handle: string }[] {
  const out: { number: number; handle: string }[] = []
  for (const issue of issues) {
    if (issue.assignees.length > 0 || !issue.labels.includes('onboarding')) continue
    const handle = handleFromTitle(issue.title)
    if (handle && isCollaborator(handle)) out.push({ number: issue.number, handle })
  }
  return out
}

/** The kestrel-ticket block of a stage template, unfilled, or null when it has none. */
export function templateBlock(template: string): string | null {
  return BLOCK.exec(template.replace(/\r\n/g, '\n'))?.[0] ?? null
}

/** Fills the two placeholders a block uses. */
export function renderBlock(block: string, vars: { handle: string; repoUrl: string }): string {
  return block.replaceAll('{{handle}}', vars.handle).replaceAll('{{repo_url}}', vars.repoUrl)
}

/** The issue body with its block replaced by the fresh one, or null when it is already current. */
export function refreshBody(body: string, fresh: string): string | null {
  const normal = body.replace(/\r\n/g, '\n')
  const current = BLOCK.exec(normal)?.[0]
  if (current === fresh) return null
  return current ? normal.replace(BLOCK, () => fresh) : `${normal.trimEnd()}\n\n${fresh}\n`
}

/** The label of the Stage 5 pool, which onboarding members claim from instead of a personal issue. */
export const SHARED_ISSUE_LABEL = 'good-shared-issue'
/** The fewest open shared-pool issues each track may have before the upkeep job fails. */
export const POOL_MINIMUM = 3

export type PoolIssue = { number: number; title: string; labels: string[] }
export type PoolProblem =
  | { kind: 'no-stage'; number: number; message: string }
  | { kind: 'no-track'; number: number; message: string }
  | { kind: 'too-few'; track: Track; open: number; message: string }

/**
 * What is wrong with the open shared pool: an issue without stage:5, an issue without a track label,
 * and a track with fewer than POOL_MINIMUM open issues. Every good-shared-issue is a Stage 5 issue on
 * one track (ADR 0010); Kestrel reads the stage label and each track's Stage 5 link filters by its own
 * track label, so an issue missing either is invisible to someone.
 */
export function checkSharedPool(issues: readonly PoolIssue[]): PoolProblem[] {
  const stageLabel = `stage:${SHARED_STAGE}`
  const pool = issues.filter((i) => i.labels.includes(SHARED_ISSUE_LABEL))
  const problems: PoolProblem[] = []
  for (const i of pool) {
    if (!i.labels.includes(stageLabel)) {
      problems.push({
        kind: 'no-stage',
        number: i.number,
        message: `#${i.number} (${i.title}) is labelled ${SHARED_ISSUE_LABEL} but not ${stageLabel}. Add it: gh issue edit ${i.number} --add-label ${stageLabel}`,
      })
    }
    if (!TRACKS.some((t) => i.labels.includes(`track:${t}`))) {
      problems.push({
        kind: 'no-track',
        number: i.number,
        message: `#${i.number} (${i.title}) is labelled ${SHARED_ISSUE_LABEL} but has no track label. Add ${TRACKS.map((t) => `track:${t}`).join(' or ')}.`,
      })
    }
  }
  for (const track of TRACKS) {
    const open = pool.filter((i) => i.labels.includes(`track:${track}`)).length
    if (open < POOL_MINIMUM) {
      problems.push({
        kind: 'too-few',
        track,
        open,
        message: `track:${track} has ${open} open ${SHARED_ISSUE_LABEL} issue(s); keep at least ${POOL_MINIMUM}. Add issues to docs/backlog-seed.md and run node scripts/open-backlog.mjs --track ${track} --gh.`,
      })
    }
  }
  return problems
}
