import { describe, expect, it } from 'vitest'
import {
  discordMessage,
  overdue,
  QUEUE_MARKER,
  queueIssueBody,
  waitedFor,
  waitingSince,
  type WaitingPullRequest,
} from './maintainer-queue.js'

const NOW = Date.parse('2026-11-14T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()
const pr = (
  number: number,
  waitedHours: number,
  over: Partial<WaitingPullRequest> = {},
): WaitingPullRequest => ({
  number,
  title: `Add me to CONTRIBUTORS.md (${number})`,
  author: 'ijayabby',
  url: `https://github.com/kestrel-collective/nest/pull/${number}`,
  waitingSince: hoursAgo(waitedHours),
  ...over,
})

describe('when a pull request started waiting for a maintainer', () => {
  it("is the gate's comment, or the pull request's opening when it has none", () => {
    expect(waitingSince({ createdAt: hoursAgo(50), commentAt: hoursAgo(30), maintainerReviewsAt: [] })).toBe(
      hoursAgo(30),
    )
    expect(waitingSince({ createdAt: hoursAgo(50), commentAt: null, maintainerReviewsAt: [] })).toBe(
      hoursAgo(50),
    )
  })

  it("restarts at a maintainer's later review, but not at an older one or an empty time", () => {
    const at = waitingSince({
      createdAt: hoursAgo(50),
      commentAt: hoursAgo(30),
      maintainerReviewsAt: [hoursAgo(40), hoursAgo(5), ''],
    })
    expect(at).toBe(hoursAgo(5))
  })
})

describe('the overdue list', () => {
  it('keeps the pull requests that waited more than 24 hours, the longest first', () => {
    const list = overdue([pr(1, 23), pr(2, 30), pr(3, 100), pr(4, 24)], NOW)
    expect(list.map((p) => p.number)).toEqual([3, 2])
  })

  it('says how long, in hours under two days and in days after', () => {
    expect(waitedFor(hoursAgo(1), NOW)).toBe('1 hour')
    expect(waitedFor(hoursAgo(30), NOW)).toBe('30 hours')
    expect(waitedFor(hoursAgo(75), NOW)).toBe('3 days')
  })
})

describe('the queue issue', () => {
  it('lists each pull request with its wait, without @-mentioning the learner', () => {
    const body = queueIssueBody([pr(3, 75), pr(2, 30)], NOW)
    expect(body.startsWith(QUEUE_MARKER)).toBe(true)
    expect(body).toContain('- [ ] #3 Add me to CONTRIBUTORS.md (3), by ijayabby, waiting 3 days')
    expect(body.indexOf('#3')).toBeLessThan(body.indexOf('#2'))
    expect(body).not.toContain('@ijayabby')
    expect(body).toContain('2026-11-14 12:00 UTC')
  })

  it('says so when nothing is overdue', () => {
    expect(queueIssueBody([], NOW)).toContain('No pull request has waited more than 24 hours')
  })
})

describe('the Discord message', () => {
  it('is nothing when nothing is overdue', () => {
    expect(discordMessage([], NOW)).toBeNull()
  })

  it('links each pull request, without an embed', () => {
    const text = discordMessage([pr(3, 75)], NOW)!
    expect(text).toContain('**1 pull request has waited more than 24 hours for a maintainer**')
    expect(text).toContain('[#3](<https://github.com/kestrel-collective/nest/pull/3>)')
  })

  it("stays within Discord's 2000 characters, saying how many it left out", () => {
    const many = Array.from({ length: 60 }, (_, i) => pr(i + 1, 30, { title: 'x'.repeat(60) }))
    const text = discordMessage(many, NOW)!
    expect(text.length).toBeLessThanOrEqual(2000)
    expect(text).toMatch(/…and \d+ more$/)
  })
})
