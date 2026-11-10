import { afterEach, describe, expect, it } from 'vitest'
import { enroll, type EnrollOptions } from './commands/enroll.js'
import { existingStageIssue, planScaffoldPr, stageIssueKey } from './commands/enroll-steps.js'
import { NEST_BOT_LOGIN, type BranchPr } from './gh.js'
import { FakeGh } from './gh-fakes.js'
import { collectIo } from './io.js'
import { checkOwnDirectoryChange } from './paths.js'
import { planScaffold } from './commands/scaffold.js'
import { cleanup, tempRepo } from './test-support.js'

afterEach(cleanup)

const BRANCH = 'scaffold/test-three'
const LEGACY = 'github-actions[bot]'
const quiet = { sleep: () => {}, baseMs: 0 }
const opts = (over: Partial<EnrollOptions> = {}): EnrollOptions => ({
  handle: 'test-three',
  name: 'Test Three',
  cohort: '2027-01',
  mode: 'apply',
  today: '2027-01-12',
  retry: quiet,
  botLogin: NEST_BOT_LOGIN,
  ...over,
})
const repo = () => tempRepo({ '.github/CODEOWNERS': '* @Nyakachess\n' })
const stepB = (r: { steps: { step: string; outcome: string; detail: string }[] }) =>
  r.steps.find((s) => s.step === 'b')
const count = (gh: FakeGh, method: string) => gh.calls.filter((c) => c.startsWith(`${method} `)).length
const prsOn = (gh: FakeGh, branch: string) =>
  gh.pullRequests.filter((p) => p.branch === branch).map((p) => p.pr)

describe('planScaffoldPr', () => {
  const pr = (over: Partial<BranchPr>): BranchPr => ({
    number: 1,
    url: 'https://x/1',
    author: LEGACY,
    state: 'open',
    draft: true,
    ...over,
  })
  const onRemote = () => true
  const gone = () => false

  it('scaffolds when the branch has no pull request', () => {
    expect(planScaffoldPr([], NEST_BOT_LOGIN, onRemote)).toEqual({ action: 'scaffold' })
  })

  it("keeps an open pull request from the app, whatever the login's case", () => {
    const open = pr({ author: 'Kestrel-Nest-Bot[bot]' })
    expect(planScaffoldPr([open], NEST_BOT_LOGIN, onRemote)).toEqual({ action: 'keep', pr: open })
  })

  it('replaces an open pull request from the workflow token', () => {
    const open = pr({})
    expect(planScaffoldPr([open], NEST_BOT_LOGIN, onRemote)).toEqual({ action: 'replace', pr: open })
  })

  it('reopens from the branch after a replace that closed the old one and stopped', () => {
    const closed = pr({ state: 'closed' })
    expect(planScaffoldPr([closed], NEST_BOT_LOGIN, onRemote)).toEqual({ action: 'reopen', pr: closed })
    expect(planScaffoldPr([closed], NEST_BOT_LOGIN, gone)).toEqual({ action: 'scaffold' })
  })

  it('looks at the open one first, then only the newest', () => {
    const older = pr({ number: 1, state: 'closed' })
    const open = pr({ number: 2, author: NEST_BOT_LOGIN })
    expect(planScaffoldPr([open, older], NEST_BOT_LOGIN, onRemote).action).toBe('keep')
    const closedByApp = pr({ number: 3, state: 'closed', author: NEST_BOT_LOGIN })
    expect(planScaffoldPr([closedByApp, older], NEST_BOT_LOGIN, onRemote).action).toBe('leave')
  })

  it('leaves a merged pull request, from anyone', () => {
    expect(planScaffoldPr([pr({ state: 'merged' })], NEST_BOT_LOGIN, onRemote).action).toBe('leave')
  })

  it('replaces nothing without a bot login, as before the app', () => {
    expect(planScaffoldPr([pr({})], '', onRemote).action).toBe('keep')
    expect(planScaffoldPr([pr({ state: 'closed' })], '', onRemote).action).toBe('leave')
  })
})

describe('enroll with the Nest bot app', () => {
  it('opens a fresh scaffold as the app', () => {
    const gh = new FakeGh()
    const r = enroll(repo(), opts(), gh, collectIo())
    expect(stepB(r)?.outcome).toBe('created')
    expect(prsOn(gh, BRANCH)).toEqual([
      expect.objectContaining({ author: NEST_BOT_LOGIN, state: 'open', draft: true }),
    ])
  })

  it('closes an open scaffold pull request from the workflow token and opens one from the app on the same branch', () => {
    const gh = new FakeGh({ pullRequests: [{ branch: BRANCH, author: LEGACY, draft: true }] })
    const r = enroll(repo(), opts(), gh, collectIo())
    expect(r.failed).toBe(false)
    expect(stepB(r)?.outcome).toBe('updated')
    const [old, fresh] = prsOn(gh, BRANCH)
    expect(old).toMatchObject({ author: LEGACY, state: 'closed' })
    expect(fresh).toMatchObject({ author: NEST_BOT_LOGIN, state: 'open', draft: true })
    expect(gh.prComments.get(old!.number)?.[0]).toContain('Every commit on the branch is kept')
    // the member's Stage 2 commits are on that branch: nothing is scaffolded or pushed over them
    expect(count(gh, 'createDraftPr')).toBe(0)
    expect(gh.calls.indexOf(`closePr ${old!.number}`)).toBeLessThan(
      gh.calls.indexOf(`createPrFromBranch ${BRANCH}`),
    )
    expect(gh.prs.at(-1)).toMatchObject({ title: 'Scaffold for @test-three', assignee: 'test-three' })
    expect(gh.prs.at(-1)?.body).toContain('Stage 2')
  })

  it('keeps a replaced pull request ready for review when the old one was', () => {
    const gh = new FakeGh({ pullRequests: [{ branch: BRANCH, author: LEGACY, draft: false }] })
    enroll(repo(), opts(), gh, collectIo())
    expect(prsOn(gh, BRANCH).at(-1)).toMatchObject({ author: NEST_BOT_LOGIN, state: 'open', draft: false })
  })

  it('replaces once: a second run keeps the pull request from the app', () => {
    const gh = new FakeGh({ pullRequests: [{ branch: BRANCH, author: LEGACY }] })
    const config = repo()
    enroll(config, opts(), gh, collectIo())
    const r = enroll(config, opts(), gh, collectIo())
    expect(stepB(r)).toMatchObject({ outcome: 'skipped' })
    expect(prsOn(gh, BRANCH)).toHaveLength(2)
    expect(count(gh, 'closePr')).toBe(1)
    expect(count(gh, 'createPrFromBranch')).toBe(1)
  })

  it('finishes a replace whose new pull request failed, on the next run', () => {
    const gh = new FakeGh({ pullRequests: [{ branch: BRANCH, author: LEGACY }] })
    const config = repo()
    gh.failNext('createPrFromBranch', 2)
    expect(enroll(config, opts({ retry: { ...quiet, attempts: 2 } }), gh, collectIo()).failed).toBe(true)
    expect(prsOn(gh, BRANCH)).toEqual([expect.objectContaining({ state: 'closed' })])
    const r = enroll(config, opts(), gh, collectIo())
    expect(stepB(r)?.outcome).toBe('created')
    expect(prsOn(gh, BRANCH).at(-1)).toMatchObject({ author: NEST_BOT_LOGIN, state: 'open' })
    expect(count(gh, 'closePr')).toBe(1)
  })

  it('without a bot login keeps the open pull request, as before', () => {
    const gh = new FakeGh({ pullRequests: [{ branch: BRANCH, author: LEGACY }] })
    const r = enroll(repo(), opts({ botLogin: undefined }), gh, collectIo())
    expect(stepB(r)?.outcome).toBe('skipped')
    expect(count(gh, 'closePr')).toBe(0)
  })
})

describe('stage issues are never opened twice', () => {
  it('matches a stage issue by stage number and handle, not only by its title', () => {
    expect(stageIssueKey('Stage 3: Fix your defect (@Test-Three)')).toBe('3 @test-three')
    expect(stageIssueKey('Enrolment failed for @test-three')).toBeNull()
    const exists = existingStageIssue([
      'Stage 1: Get it running (@test-three)',
      'Stage 2: Your page (@someone-else)',
    ])
    expect(exists('Stage 1: Make it run (@test-three)')).toBe(true)
    expect(exists('stage 1: get it running (@TEST-THREE)')).toBe(true)
    expect(exists('Stage 2: Your page exists (@test-three)')).toBe(false)
  })

  it('reuses an issue whose stage was renamed since, and opens only the missing ones', () => {
    const gh = new FakeGh({ issueTitles: { 'test-three': ['Stage 1: Get it running (@test-three)'] } })
    const r = enroll(repo(), opts(), gh, collectIo())
    expect(r.issuesSkipped).toEqual(['Stage 1: Make it run (@test-three)'])
    expect(gh.issues.filter((i) => /^Stage 1:/.test(i.title))).toHaveLength(1)
    expect(count(gh, 'createIssue')).toBe(5)
  })

  it('opens none on a second run', () => {
    const gh = new FakeGh()
    const config = repo()
    enroll(config, opts(), gh, collectIo())
    const r = enroll(config, opts(), gh, collectIo())
    expect(r.issuesCreated).toEqual([])
    expect(count(gh, 'createIssue')).toBe(6)
  })
})

describe('auto-merge for a scaffold pull request from the app', () => {
  const files = ['contributors/test-three/profile.yml', 'contributors/test-three/page.md']

  it("counts as the member's own directory change", () => {
    expect(checkOwnDirectoryChange(files, NEST_BOT_LOGIN, BRANCH)).toEqual({ ok: true, handle: 'test-three' })
  })

  it('still refuses a file outside that directory, or one that does not belong there', () => {
    expect(checkOwnDirectoryChange([...files, 'README.md'], NEST_BOT_LOGIN, BRANCH).ok).toBe(false)
    expect(checkOwnDirectoryChange(['contributors/test-two/page.md'], NEST_BOT_LOGIN, BRANCH).ok).toBe(false)
    expect(checkOwnDirectoryChange(['contributors/test-three/practice.yml'], NEST_BOT_LOGIN, BRANCH).ok).toBe(
      false,
    )
  })

  it('refuses a pull request from the app on any other branch', () => {
    const r = checkOwnDirectoryChange(files, NEST_BOT_LOGIN, 'feature/x')
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('scaffold/<handle>') })
  })

  it('gives the rule to the app only, not to another bot or the workflow token', () => {
    expect(checkOwnDirectoryChange(files, 'dependabot[bot]', BRANCH).ok).toBe(false)
    expect(checkOwnDirectoryChange(files, LEGACY, BRANCH).ok).toBe(false)
  })
})

describe("the scaffold pull request after the learner's Stage 2 commits", () => {
  // The auto-merge check sees the pull request's author (the app, who opened it) and the files the
  // pull request changes against main (the scaffold plus the learner's edits). Who made each commit
  // is not an input, so the learner's commits on scaffold/<handle> cannot change the answer.
  const dir = (names: readonly string[]) => names.map((n) => `contributors/test-three/${n}`)

  it('still counts as their own directory on the js track, with every file the scaffold wrote', () => {
    const names = Object.keys(
      planScaffold(repo(), { handle: 'test-three', cohort: '2027-01', today: '2027-01-12' }).files,
    )
    expect(names).toEqual(expect.arrayContaining(['profile.yml', 'page.md', 'profile.test.ts']))
    expect(checkOwnDirectoryChange(dir(names), NEST_BOT_LOGIN, BRANCH)).toEqual({
      ok: true,
      handle: 'test-three',
    })
  })

  it('and on the python track, with test_profile.py', () => {
    const names = ['profile.yml', 'page.md', 'README.md', 'test_profile.py'] // nest_data templates.render_all
    expect(checkOwnDirectoryChange(dir(names), NEST_BOT_LOGIN, BRANCH)).toEqual({
      ok: true,
      handle: 'test-three',
    })
  })

  it('stops counting as their own the moment a commit touches a shared file', () => {
    const r = checkOwnDirectoryChange(
      [...dir(['profile.yml', 'page.md']), 'CONTRIBUTORS.md'],
      NEST_BOT_LOGIN,
      BRANCH,
    )
    expect(r).toEqual({
      ok: false,
      reason: expect.stringContaining('CONTRIBUTORS.md is outside contributors/test-three/'),
    })
  })
})
