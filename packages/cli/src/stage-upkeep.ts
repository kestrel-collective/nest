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
 */

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
