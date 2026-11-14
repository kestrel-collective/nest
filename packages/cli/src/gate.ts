import { checkOwnDirectoryChange } from './paths.js'

/**
 * The maintainer gate (docs/REPO-SETTINGS.md): the required check `maintainer-gate`, which the
 * Nest bot app posts on a pull request's head commit. It passes at once for a change limited to
 * the author's own contributor directory (the scaffold pull request from the app included, see
 * paths.ts), so those still merge on their own; any other change passes only once a maintainer
 * has approved the head commit. It takes the place of the ruleset's required approvals, which
 * cannot tell the two kinds apart.
 */
export const GATE_CHECK = 'maintainer-gate'

export type Review = {
  login: string
  /** APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED or PENDING, as the REST API gives it. */
  state: string
  /** The commit the review was made on. */
  commitId: string
  submittedAt: string
}

export type GateInput = {
  files: readonly string[]
  author: string
  headRef: string
  headSha: string
  /** Every review on the pull request, in any order. */
  reviews: readonly Review[]
  /** Whether a login is a maintainer: admin or maintain permission on the repository. */
  isMaintainer: (login: string) => boolean
}

/**
 * What the check shows while a shared-file change waits for a maintainer. The check is posted as
 * in progress, never `neutral`: a required check that ends `neutral` counts as passed, so the pull
 * request could merge without anyone's approval.
 */
export const GATE_WAITING_TITLE = 'Waiting for a maintainer to review'

/** `pending` is posted as an in-progress check run: yellow, and it holds the merge. */
export type GateResult = { conclusion: 'success' | 'failure' | 'pending'; title: string; summary: string }

/**
 * Each maintainer's standing review: their latest one that approves, requests changes or was
 * dismissed (a comment leaves the standing review as it was, as on GitHub). The author's own
 * reviews and anyone else's are left out.
 */
export function standingReviews(input: Pick<GateInput, 'author' | 'reviews' | 'isMaintainer'>): Review[] {
  const latest = new Map<string, Review>()
  const ordered = [...input.reviews].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  for (const r of ordered) {
    const login = r.login.toLowerCase()
    if (
      login === input.author.toLowerCase() ||
      !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)
    )
      continue
    if (input.isMaintainer(r.login)) latest.set(login, r)
  }
  return [...latest.values()]
}

export function gateDecision(input: GateInput): GateResult {
  const own = checkOwnDirectoryChange(input.files, input.author, input.headRef)
  if (own.ok)
    return {
      conclusion: 'success',
      title: `Own directory of @${own.handle}`,
      summary: `Every changed file is in contributors/${own.handle}/, so no maintainer review is needed.`,
    }
  const standing = standingReviews(input)
  const blocking = standing.filter((r) => r.state === 'CHANGES_REQUESTED')
  if (blocking.length > 0)
    return {
      conclusion: 'failure',
      title: `Changes requested by @${blocking.map((r) => r.login).join(', @')}`,
      summary: `${own.reason} A maintainer asked for changes; it passes once a maintainer approves the latest commit.`,
    }
  const approved = standing.filter((r) => r.state === 'APPROVED' && r.commitId === input.headSha)
  if (approved.length > 0)
    return {
      conclusion: 'success',
      title: `Approved by @${approved.map((r) => r.login).join(', @')}`,
      summary: `Approved by a maintainer on ${input.headSha.slice(0, 7)}, the latest commit.`,
    }
  const stale = standing.some((r) => r.state === 'APPROVED')
  return {
    conclusion: 'pending',
    title: GATE_WAITING_TITLE,
    summary: `${own.reason} It changes files outside one contributor directory, so a maintainer approves it${
      stale ? ' again: their approval is for an older commit, and this one is new' : ''
    } before it merges. Nothing is wrong with the pull request; this turns green once a maintainer approves.`,
  }
}

/** Hidden marker on the one comment the gate posts while a pull request waits for a maintainer. */
export const WAITING_COMMENT_MARKER = '<!-- nest:maintainer-gate-waiting -->'

/**
 * The learner a pull request belongs to: its author, or for a scaffold pull request, which a bot
 * opens, the handle its `scaffold/<handle>` branch names.
 */
export function learnerOf(author: string, headRef: string): string {
  const scaffold = /^scaffold\/([^/]+)$/.exec(headRef)
  return author.endsWith('[bot]') && scaffold ? scaffold[1]! : author
}

/** The comment posted once on a pull request that waits for a maintainer. */
export function waitingComment(learner: string): string {
  return [
    WAITING_COMMENT_MARKER,
    `Thanks @${learner}! This pull request changes a shared file, one outside your own \`contributors/\` directory, so a maintainer reviews it before it merges. That usually happens within a day.`,
    '',
    `You have done nothing wrong, and there is nothing you need to do now. The \`maintainer-gate\` check shows "${GATE_WAITING_TITLE}" until then, and turns green on its own once a maintainer approves. If they ask for a change, they will say so here.`,
    '',
  ].join('\n')
}
