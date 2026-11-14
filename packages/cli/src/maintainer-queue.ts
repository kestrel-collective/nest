/**
 * The maintainer queue: the pull requests whose maintainer-gate check (gate.ts) has been waiting
 * for a maintainer for more than a day. The daily Maintainer queue workflow lists them in one
 * pinned issue, or posts them to Discord when NEST_DISCORD_WEBHOOK is set.
 */

/** Hidden marker that makes the one queue issue recognisable. */
export const QUEUE_MARKER = '<!-- nest:maintainer-queue -->'
export const QUEUE_TITLE = 'Pull requests waiting for a maintainer'
export const OVERDUE_HOURS = 24
/** Discord rejects a message longer than this. */
const DISCORD_LIMIT = 2000
const HOUR_MS = 60 * 60 * 1000

export type WaitingPullRequest = {
  number: number
  title: string
  author: string
  url: string
  /** When its current wait began (waitingSince). */
  waitingSince: string
}

/**
 * When a pull request's current wait for a maintainer began: when the gate first said it was
 * waiting (its comment; without one, when the pull request was opened), or a maintainer's latest
 * review, whichever is later, since a review means a maintainer has looked. A learner's pushes do
 * not restart the clock.
 */
export function waitingSince(input: {
  createdAt: string
  commentAt?: string | null
  /** When each maintainer other than the author reviewed, in any state. */
  maintainerReviewsAt: readonly string[]
}): string {
  const times = [input.commentAt || input.createdAt, ...input.maintainerReviewsAt.filter(Boolean)]
  return times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
}

/** The pull requests that have waited longer than `hours`, the longest wait first. */
export function overdue(
  prs: readonly WaitingPullRequest[],
  nowMs: number,
  hours = OVERDUE_HOURS,
): WaitingPullRequest[] {
  return prs
    .filter((p) => nowMs - Date.parse(p.waitingSince) > hours * HOUR_MS)
    .sort((a, b) => Date.parse(a.waitingSince) - Date.parse(b.waitingSince))
}

/** How long a wait has lasted, in whole hours under two days and whole days after. */
export function waitedFor(since: string, nowMs: number): string {
  const hours = Math.floor((nowMs - Date.parse(since)) / HOUR_MS)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${Math.floor(hours / 24)} days`
}

const line = (p: WaitingPullRequest, nowMs: number) =>
  `#${p.number} ${p.title}, by ${p.author}, waiting ${waitedFor(p.waitingSince, nowMs)}`

/** The queue issue's body. The handles are not @-mentions, so the learners get no ping each day. */
export function queueIssueBody(prs: readonly WaitingPullRequest[], nowMs: number): string {
  const updated = new Date(nowMs).toISOString().slice(0, 16).replace('T', ' ')
  const list =
    prs.length === 0
      ? [`No pull request has waited more than ${OVERDUE_HOURS} hours for a maintainer.`]
      : [
          `These pull requests change shared files and have waited more than ${OVERDUE_HOURS} hours for a maintainer's review, the longest first:`,
          '',
          ...prs.map((p) => `- [ ] ${line(p, nowMs)}`),
        ]
  return [
    QUEUE_MARKER,
    ...list,
    '',
    `The Maintainer queue workflow rewrites this issue every day; updated ${updated} UTC. Approving a pull request turns its \`maintainer-gate\` check green and takes it off this list.`,
    '',
  ].join('\n')
}

/** The Discord message, or null when nothing is overdue. It never pings anyone. */
export function discordMessage(prs: readonly WaitingPullRequest[], nowMs: number): string | null {
  if (prs.length === 0) return null
  const head = `**${prs.length} pull request${prs.length === 1 ? ' has' : 's have'} waited more than ${OVERDUE_HOURS} hours for a maintainer**`
  const lines = prs.map(
    (p) => `- [#${p.number}](<${p.url}>) ${p.title}, by ${p.author}, ${waitedFor(p.waitingSince, nowMs)}`,
  )
  let text = [head, ...lines].join('\n')
  for (let shown = lines.length - 1; text.length > DISCORD_LIMIT && shown > 0; shown--)
    text = [head, ...lines.slice(0, shown), `…and ${lines.length - shown} more`].join('\n')
  return text.slice(0, DISCORD_LIMIT)
}
