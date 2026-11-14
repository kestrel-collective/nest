import { describe, expect, it } from 'vitest'
import {
  gateDecision,
  GATE_CHECK,
  GATE_WAITING_TITLE,
  learnerOf,
  standingReviews,
  WAITING_COMMENT_MARKER,
  waitingComment,
  type GateInput,
  type Review,
} from './gate.js'
import { NEST_BOT_LOGIN } from './gh.js'

const HEAD = 'c0ffee1234567890'
const OLD = 'deadbeef00000000'
const maintainers = new Set(['nyakachess'])
const review = (
  login: string,
  state: string,
  commitId = HEAD,
  submittedAt = '2026-11-09T10:00:00Z',
): Review => ({
  login,
  state,
  commitId,
  submittedAt,
})
const input = (over: Partial<GateInput>): GateInput => ({
  files: ['CONTRIBUTORS.md'],
  author: 'ijayabby',
  headRef: 'stage-1-ijayabby',
  headSha: HEAD,
  reviews: [],
  isMaintainer: (login) => maintainers.has(login.toLowerCase()),
  ...over,
})

describe('the maintainer gate', () => {
  it('is the check name the ruleset requires', () => {
    expect(GATE_CHECK).toBe('maintainer-gate')
  })

  it("passes a change to the author's own directory at once, with no review", () => {
    const r = gateDecision(input({ files: ['contributors/ijayabby/page.md'] }))
    expect(r).toMatchObject({ conclusion: 'success', title: 'Own directory of @ijayabby' })
  })

  it('passes the scaffold pull request from the app, which the learner finishes', () => {
    const r = gateDecision(
      input({
        author: NEST_BOT_LOGIN,
        headRef: 'scaffold/ijayabby',
        files: ['contributors/ijayabby/profile.yml', 'contributors/ijayabby/page.md'],
      }),
    )
    expect(r.conclusion).toBe('success')
  })

  it('holds a shared-file change, such as the Stage 1 line in CONTRIBUTORS.md, pending until a maintainer approves', () => {
    const waiting = gateDecision(input({}))
    expect(waiting).toMatchObject({ conclusion: 'pending', title: 'Waiting for a maintainer to review' })
    expect(waiting.title).toBe(GATE_WAITING_TITLE)
    expect(waiting.summary).toContain('CONTRIBUTORS.md is outside contributors/ijayabby/')
    expect(waiting.summary).toContain('Nothing is wrong with the pull request')
    const approved = gateDecision(input({ reviews: [review('Nyakachess', 'APPROVED')] }))
    expect(approved).toMatchObject({ conclusion: 'success', title: 'Approved by @Nyakachess' })
  })

  it('does not count an approval from someone who is not a maintainer', () => {
    expect(gateDecision(input({ reviews: [review('viktor-at-dev', 'APPROVED')] })).conclusion).toBe('pending')
  })

  it('needs the approval on the latest commit: a push after it waits for a maintainer again', () => {
    const r = gateDecision(input({ reviews: [review('Nyakachess', 'APPROVED', OLD)] }))
    expect(r).toMatchObject({ conclusion: 'pending', title: GATE_WAITING_TITLE })
    expect(r.summary).toContain('approval is for an older commit')
  })

  it("follows each maintainer's latest standing review; a later comment does not undo an approval", () => {
    const approvedThenCommented = [
      review('Nyakachess', 'APPROVED', HEAD, '2026-11-09T10:00:00Z'),
      review('Nyakachess', 'COMMENTED', HEAD, '2026-11-09T11:00:00Z'),
    ]
    expect(gateDecision(input({ reviews: approvedThenCommented })).conclusion).toBe('success')
    const changesThenApproved = [
      review('Nyakachess', 'APPROVED', HEAD, '2026-11-09T12:00:00Z'),
      review('Nyakachess', 'CHANGES_REQUESTED', HEAD, '2026-11-09T10:00:00Z'),
    ]
    expect(gateDecision(input({ reviews: changesThenApproved })).conclusion).toBe('success')
    const dismissed = [
      review('Nyakachess', 'APPROVED', HEAD, '2026-11-09T10:00:00Z'),
      review('Nyakachess', 'DISMISSED', HEAD, '2026-11-09T11:00:00Z'),
    ]
    expect(gateDecision(input({ reviews: dismissed })).conclusion).toBe('pending')
  })

  it('fails while any maintainer has changes requested, even with another approval', () => {
    maintainers.add('apiyo4')
    const r = gateDecision(
      input({ reviews: [review('Nyakachess', 'APPROVED'), review('Apiyo4', 'CHANGES_REQUESTED')] }),
    )
    maintainers.delete('apiyo4')
    expect(r).toMatchObject({ conclusion: 'failure', title: 'Changes requested by @Apiyo4' })
  })

  it("ignores the author's own reviews, even a maintainer's", () => {
    const own = input({ author: 'Nyakachess', reviews: [review('Nyakachess', 'APPROVED')] })
    expect(standingReviews(own)).toEqual([])
    expect(gateDecision(own).conclusion).toBe('pending')
  })
})

describe('the comment on a pull request that waits for a maintainer', () => {
  it('greets the learner, says a maintainer reviews shared files within a day, and that nothing is wrong', () => {
    const body = waitingComment('ijayabby')
    expect(body.startsWith(WAITING_COMMENT_MARKER)).toBe(true)
    expect(body).toContain('@ijayabby')
    expect(body).toContain('shared file')
    expect(body).toContain('within a day')
    expect(body).toContain('You have done nothing wrong')
    expect(body).toContain(GATE_WAITING_TITLE)
  })

  it('names the member for a scaffold pull request the app opened, and the author otherwise', () => {
    expect(learnerOf('kestrel-nest-bot[bot]', 'scaffold/ijayabby')).toBe('ijayabby')
    expect(learnerOf('ijayabby', 'scaffold/someone-else')).toBe('ijayabby')
    expect(learnerOf('ijayabby', 'stage-1-ijayabby')).toBe('ijayabby')
  })
})
