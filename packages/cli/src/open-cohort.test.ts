import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openCohort } from './commands/open-cohort.js'
import { scaffold } from './commands/scaffold.js'
import { FakeGh } from './gh-fakes.js'
import { collectIo } from './io.js'
import { cleanup, tempRepo } from './test-support.js'

afterEach(cleanup)

const PERSONAL = [1, 2, 3, 4, 6, 7]
const titleFor = (n: number, handle: string) => new RegExp('^Stage ' + n + ': .* [(]@' + handle + '[)]$')

describe('open-cohort', () => {
  it('scaffolds every member, opens a draft PR each, and creates six personal issues per member', () => {
    const config = tempRepo()
    const gh = new FakeGh()
    const io = collectIo()
    const report = openCohort(config, { id: '2027-01', mode: 'apply', today: '2027-01-12' }, gh, io)

    expect(report.scaffolded).toEqual(['test-one', 'test-two'])
    expect(gh.prs.map((p) => p.title)).toEqual(['Scaffold for @test-one', 'Scaffold for @test-two'])
    expect(gh.prs[0]).toMatchObject({ branch: 'scaffold/test-one', paths: ['contributors/test-one'] })
    expect(gh.issues).toHaveLength(12)
    const titles = gh.issues.map((i) => i.title)
    PERSONAL.forEach((n, i) => expect(titles[i]).toMatch(titleFor(n, 'test-one')))
    PERSONAL.forEach((n, i) => expect(titles[6 + i]).toMatch(titleFor(n, 'test-two')))
    expect(gh.issues.every((i) => i.milestone === '2027-01')).toBe(true)
    expect(gh.issues[0]?.labels).toEqual(['onboarding', 'cohort:2027-01', 'stage:1', 'track:js'])
    expect(gh.issues[0]?.assignee).toBe('test-one')
    expect(gh.issues.some((i) => i.labels.includes('stage:5'))).toBe(false)
    expect(gh.milestones.has('2027-01')).toBe(true)
    expect([...gh.labels].sort()).toEqual([
      'cohort:2027-01',
      'onboarding',
      'stage:1',
      'stage:2',
      'stage:3',
      'stage:4',
      'stage:6',
      'stage:7',
      'track:js',
    ])
    expect(existsSync(join(config.root, 'contributors', 'test-two', 'profile.yml'))).toBe(true)
  })

  it('creates nothing on a second run', () => {
    const config = tempRepo()
    const gh = new FakeGh()
    openCohort(config, { id: '2027-01', mode: 'apply' }, gh, collectIo())
    const before = { issues: gh.issues.length, prs: gh.prs.length }
    const report = openCohort(config, { id: '2027-01', mode: 'apply' }, gh, collectIo())
    expect(gh.issues).toHaveLength(before.issues)
    expect(gh.prs).toHaveLength(before.prs)
    expect(report.issuesCreated).toEqual([])
    expect(report.issuesSkipped).toHaveLength(12)
    expect(report.scaffoldSkipped).toEqual(['test-one', 'test-two'])
  })

  it('skips the scaffold when the directory exists and when a PR from the branch exists', () => {
    const config = tempRepo()
    scaffold(config, { handle: 'test-one' })
    const gh = new FakeGh({ prBranches: ['scaffold/test-two'] })
    const report = openCohort(config, { id: '2027-01', mode: 'apply' }, gh, collectIo())
    expect(report.scaffolded).toEqual([])
    expect(report.scaffoldSkipped).toEqual(['test-one', 'test-two'])
    expect(gh.prs).toHaveLength(1)
  })

  it('skips issues whose title already exists for the handle, ignoring case', () => {
    const config = tempRepo()
    const gh = new FakeGh({ issueTitles: { 'test-one': ['stage 3: fix your defect (@test-one)'] } })
    const report = openCohort(config, { id: '2027-01', mode: 'apply' }, gh, collectIo())
    expect(report.issuesSkipped).toEqual(['Stage 3: Fix your defect (@test-one)'])
    expect(report.issuesCreated).toHaveLength(11)
  })

  it('dry run reads but never writes', () => {
    const config = tempRepo()
    const gh = new FakeGh()
    const io = collectIo()
    const report = openCohort(config, { id: '2027-01', mode: 'dry-run' }, gh, io)
    expect(gh.issues).toEqual([])
    expect(gh.prs).toEqual([])
    expect(existsSync(join(config.root, 'contributors', 'test-one'))).toBe(false)
    expect(report.issuesCreated).toHaveLength(12)
    expect(io.lines.filter((l) => l.startsWith('Would create "Stage ')).length).toBe(12)
    expect(gh.calls.every((c) => c.startsWith('listIssueTitles') || c.startsWith('findPr'))).toBe(true)
  })

  it('print mode only prints issue bodies', () => {
    const config = tempRepo()
    const gh = new FakeGh()
    const io = collectIo()
    openCohort(config, { id: '2027-01', mode: 'print' }, gh, io)
    expect(gh.calls).toEqual([])
    expect(io.lines.filter((l) => l.startsWith('## Stage '))).toHaveLength(12)
    expect(io.lines.join('\n')).toContain('Stage 5 is not a personal issue')
  })

  it('fails clearly for a missing cohort', () => {
    const config = tempRepo()
    expect(() => openCohort(config, { id: '2027-02', mode: 'apply' }, new FakeGh(), collectIo())).toThrow(
      'cohorts/2027-02/cohort.yml',
    )
  })
})
