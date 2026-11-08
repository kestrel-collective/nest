import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateContributor } from '@nest/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { enroll, type EnrollOptions } from './commands/enroll.js'
import { FakeGh } from './gh-fakes.js'
import { collectIo } from './io.js'
import { cleanup, tempRepo } from './test-support.js'

afterEach(cleanup)

const OWNERS = '* @Nyakachess\n'
const quiet = { sleep: () => {}, baseMs: 0 }
const opts = (over: Partial<EnrollOptions> = {}): EnrollOptions => ({
  handle: 'test-three',
  name: 'Test Three',
  cohort: '2027-01',
  mode: 'apply',
  today: '2027-01-12',
  retry: quiet,
  ...over,
})
const outcomes = (r: { steps: { step: string; outcome: string }[] }) =>
  r.steps.map((s) => `${s.step}:${s.outcome}`)
const count = (gh: FakeGh, method: string) => gh.calls.filter((c) => c.startsWith(`${method} `)).length

describe('enroll', () => {
  it('performs steps a to d for a fresh handle', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh({ root: config.root })
    const r = enroll(config, opts(), gh, collectIo())
    expect(r.failed).toBe(false)
    expect(outcomes(r)).toEqual(['a:created', 'b:created', 'c:created', 'd:created'])

    // membership is one bot commit on main, not a pull request a maintainer merges
    expect(gh.commits).toHaveLength(1)
    const commit = gh.commits[0]
    expect(commit?.message).toBe('chore(cohort): add @test-three to 2027-01')
    expect(commit?.files['cohorts/2027-01/cohort.yml']).toContain(
      '  - test-one\n  - test-three\n  - test-two\n',
    )
    expect(commit?.files['.github/CODEOWNERS']).toContain('* @Nyakachess\n')
    expect(commit?.files['.github/CODEOWNERS']).toContain('/contributors/test-three/ @test-three')
    expect(r.cohortCommit).toBe('fake-1')

    expect(gh.prs[0]).toMatchObject({
      branch: 'scaffold/test-three',
      title: 'Scaffold for @test-three',
      assignee: 'test-three',
    })
    expect(gh.prs[0]?.body).toContain('Stage 2')
    expect(existsSync(join(config.root, 'contributors', 'test-three', 'profile.yml'))).toBe(true)

    expect(gh.invitations.has('test-three')).toBe(true)
    expect(r.invitation).toBe('invited')

    expect(gh.issues).toHaveLength(6)
    expect(gh.issues.map((i) => i.title)).toEqual(
      [1, 2, 3, 4, 6, 7].map((n) => expect.stringMatching(`^Stage ${n}: `)),
    )
    expect(gh.issues[0]).toMatchObject({
      assignee: 'test-three',
      milestone: '2027-01',
      labels: ['onboarding', 'cohort:2027-01', 'stage:1', 'track:js'],
    })
    expect(gh.milestones.has('2027-01')).toBe(true)
  })

  it('performs nothing on a second run', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh()
    enroll(config, opts(), gh, collectIo())
    const before = { issues: gh.issues.length, prs: gh.prs.length }
    const r = enroll(config, opts(), gh, collectIo())
    expect(outcomes(r)).toEqual(['a:skipped', 'b:skipped', 'c:skipped', 'd:skipped'])
    expect(gh.issues).toHaveLength(before.issues)
    expect(gh.prs).toHaveLength(before.prs)
    expect(count(gh, 'createIssue')).toBe(6)
    expect(count(gh, 'inviteCollaborator')).toBe(1)
  })

  it('does not re-invite an existing collaborator', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh({ collaborators: ['Test-Three'] })
    const r = enroll(config, opts(), gh, collectIo())
    expect(r.steps.find((s) => s.step === 'c')).toMatchObject({
      outcome: 'skipped',
      detail: 'already a collaborator',
    })
    expect(count(gh, 'inviteCollaborator')).toBe(0)
    expect(r.invitation).toBe('collaborator')
  })

  it('opens no cohort PR and no milestone for cohort none', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh()
    const r = enroll(config, opts({ cohort: 'none' }), gh, collectIo())
    expect(outcomes(r)).toEqual(['a:skipped', 'b:created', 'c:created', 'd:created'])
    expect(gh.commits).toHaveLength(0)
    expect(gh.milestones.size).toBe(0)
    expect(
      gh.issues.every((i) => i.milestone === undefined && !i.labels.some((l) => l.startsWith('cohort:'))),
    ).toBe(true)
    const profile = readFileSync(join(config.root, 'contributors', 'test-three', 'profile.yml'), 'utf8')
    expect(profile).not.toMatch(/^cohort:/m)
    expect(validateContributor(config.root, 'test-three').issues).toEqual([])
  })

  it('enrols someone as an individual joiner when their cohort is not opened yet', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh()
    const io = collectIo()
    const r = enroll(config, opts({ cohort: '2031-07' }), gh, io)
    expect(r.cohort).toBe('none')
    expect(outcomes(r)).toEqual(['a:skipped', 'b:created', 'c:created', 'd:created'])
    expect(gh.commits).toHaveLength(0)
    expect(gh.issues.some((i) => i.labels.includes('cohort:2031-07'))).toBe(false)
    expect(io.lines.join(' ')).toContain('cohorts/2031-07/cohort.yml does not exist yet')
    expect(io.lines.join(' ')).toContain('open-cohort 2031-07')
  })

  it('adds two people enrolled at once to the cohort, both', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh({ root: config.root })
    // someone else is added to main between this run's read and its commit
    const cohortPath = 'cohorts/2027-01/cohort.yml'
    const before = readFileSync(join(config.root, cohortPath), 'utf8')
    gh.raceOnNextCommit = { [cohortPath]: before.replace('members:\n', 'members:\n  - test-four\n') }
    const r = enroll(config, opts(), gh, collectIo())
    expect(outcomes(r)[0]).toBe('a:created')
    const members = gh.main.get(cohortPath) ?? ''
    expect(members).toContain('  - test-four\n')
    expect(members).toContain('  - test-three\n')
  })

  it('fails step a, naming the rule, when main is protected, and still does the rest', () => {
    const config = tempRepo({ '.github/CODEOWNERS': OWNERS })
    const gh = new FakeGh({ root: config.root })
    gh.protectedMain = true
    const r = enroll(config, opts(), gh, collectIo())
    expect(r.failed).toBe(true)
    expect(outcomes(r)).toEqual(['a:failed', 'b:created', 'c:created', 'd:created'])
    expect(r.steps[0]?.detail).toMatch(/protected/)
    expect(gh.calls.filter((c) => c.startsWith('commitToMain '))).toHaveLength(1)
    expect(gh.prs.map((p) => p.branch)).toEqual(['scaffold/test-three'])
  })
})
