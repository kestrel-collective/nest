import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STAGES, TRACKS, type Track } from '@nest/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { enroll, type EnrollOptions } from './commands/enroll.js'
import { runNewTask } from './commands/new-task.js'
import { openCohort } from './commands/open-cohort.js'
import { FakeGh } from './gh-fakes.js'
import { collectIo } from './io.js'
import { renderIssue, stageFile, templateTrack } from './issue-body.js'
import type { PythonScaffold } from './python-scaffold.js'
import { blockFor, templateBlock, templateKey, trackOfLabels } from './stage-upkeep.js'
import { cleanup, cohortYml, REAL_ROOT, tempRepo } from './test-support.js'

afterEach(cleanup)

/** ADR 0010: stages 1, 3, 4 and 5 read differently on each track; 2, 6 and 7 are shared. */
const TRACK_STAGES = [1, 3, 4, 5]
const quiet = { sleep: () => {}, baseMs: 0 }

/** Stands in for nest_data's scaffold: records the call, writes nothing. */
function fakePythonScaffold(): PythonScaffold & { calls: { handle: string; plan: boolean }[] } {
  const calls: { handle: string; plan: boolean }[] = []
  const fake = ((_config, opts) => {
    calls.push({ handle: opts.handle, plan: opts.plan })
    return { defect: 'name-is-handle', files: ['profile.yml', 'page.md', 'README.md', 'test_profile.py'] }
  }) as PythonScaffold & { calls: typeof calls }
  fake.calls = calls
  return fake
}

const opts = (over: Partial<EnrollOptions> = {}): EnrollOptions => ({
  handle: 'test-three',
  name: 'Test Three',
  cohort: '2027-01',
  mode: 'print',
  today: '2027-01-12',
  retry: quiet,
  ...over,
})

describe('stage templates per track', () => {
  const files = readdirSync(join(REAL_ROOT, 'stages'))

  it.each(STAGES.map((s) => s.number))('stage %i has a body for each track, or one shared body', (n) => {
    const own = files.filter((f) => f.startsWith(`0${n}-`) && f.endsWith('.md'))
    if (TRACK_STAGES.includes(n)) {
      expect(own.map(templateTrack).sort()).toEqual(['js', 'python'])
    } else {
      expect(own.map(templateTrack)).toEqual([null])
    }
  })

  it.each(TRACKS.flatMap((t) => STAGES.map((s) => [t, s.number] as const)))(
    '%s stage %i fills every placeholder and keeps a ticket block for its stage',
    (track, n) => {
      const config = tempRepo()
      const issue = renderIssue(config, n, { handle: 'test-one', cohort: '2027-01', track })
      expect(issue.body).not.toMatch(/\{\{[a-z_]+\}\}/)
      expect(issue.labels).toContain(`track:${track}`)
      const block = templateBlock(readFileSync(stageFile(REAL_ROOT, n, track), 'utf8'))
      expect(block).toContain(`stage: ${n}`)
    },
  )

  it('opens the python Stage 1 with pip, pytest, build-data and the preview, and no Node', () => {
    const body = renderIssue(tempRepo(), 1, { handle: 'test-one', cohort: '2027-01', track: 'python' }).body
    expect(body).toContain('pip install -e "py[dev]"')
    expect(body).toContain('pytest')
    expect(body).toContain('nest build-data')
    expect(body).toContain('preview')
    expect(body).not.toMatch(/npm (install|test|run)/)
  })

  it('opens the js Stage 1 with npm, as before', () => {
    const body = renderIssue(tempRepo(), 1, { handle: 'test-one', cohort: '2027-01', track: 'js' }).body
    expect(body).toContain('npm install')
    expect(body).not.toContain('pip install')
  })

  it('fills the shared Stage 2 with each track own commands', () => {
    const config = tempRepo()
    const py = renderIssue(config, 2, { handle: 'test-one', cohort: '2027-01', track: 'python' }).body
    const js = renderIssue(config, 2, { handle: 'test-one', cohort: '2027-01', track: 'js' }).body
    expect(py).toContain('Run `nest validate`')
    expect(py).toContain('nest page-status test-one --local')
    expect(js).toContain('Run `npm run validate`')
    expect(js).toContain('http://localhost:4321/p/test-one/')
  })

  it('sends each track to its own pool of shared issues in Stage 5', () => {
    const config = tempRepo()
    expect(renderIssue(config, 5, { handle: 'x', cohort: 'none', track: 'python' }).body).toContain(
      'label%3Atrack%3Apython',
    )
    expect(renderIssue(config, 5, { handle: 'x', cohort: 'none', track: 'js' }).body).toContain(
      'label%3Atrack%3Ajs',
    )
  })
})

describe('enroll, by track', () => {
  it.each<[Track, RegExp, RegExp]>([
    ['python', /pip install -e "py\[dev\]"/, /npm install/],
    ['js', /npm install/, /pip install/],
  ])('prints the %s variant of every stage issue', (track, want, never) => {
    const config = tempRepo()
    const io = collectIo()
    const fake = fakePythonScaffold()
    const r = enroll(config, opts({ track, pythonScaffold: fake }), new FakeGh(), io)
    const text = io.lines.join('\n')
    expect(r.track).toBe(track)
    expect(text).toMatch(want)
    expect(text).not.toMatch(never)
    expect(text).toContain(`Labels: onboarding, cohort:2027-01, stage:1, track:${track}.`)
    expect(text).toContain(`${track} track, planted defect`)
    expect(fake.calls).toEqual(track === 'python' ? [{ handle: 'test-three', plan: true }] : [])
  })

  it('names the variant for each track in a dry run', () => {
    for (const track of TRACKS) {
      const io = collectIo()
      enroll(
        tempRepo(),
        opts({ track, mode: 'dry-run', pythonScaffold: fakePythonScaffold() }),
        new FakeGh(),
        io,
      )
      expect(io.lines).toContain(
        `Would create "Stage 1: Make it run (@test-three)" with labels onboarding, cohort:2027-01, stage:1, track:${track}, assignee test-three, milestone 2027-01.`,
      )
    }
  })

  it('records a python member in the cohort file and opens python issues on GitHub', () => {
    const config = tempRepo({ '.github/CODEOWNERS': '* @Nyakachess\n' })
    const gh = new FakeGh({ root: config.root })
    const fake = fakePythonScaffold()
    const r = enroll(config, opts({ track: 'python', mode: 'apply', pythonScaffold: fake }), gh, collectIo())
    expect(r.failed).toBe(false)
    expect(gh.commits[0]?.files['cohorts/2027-01/cohort.yml']).toContain(
      '  - test-one\n  - handle: test-three\n    track: python\n  - test-two\n',
    )
    expect(fake.calls).toEqual([{ handle: 'test-three', plan: false }])
    expect(gh.issues[0]?.labels).toEqual(['onboarding', 'cohort:2027-01', 'stage:1', 'track:python'])
    expect(gh.issues[0]?.body).toContain('nest build-data')
    expect(gh.labels.has('track:python')).toBe(true)
  })

  it('keeps the track the cohort file records when none is given', () => {
    const config = tempRepo({
      'cohorts/2027-01/cohort.yml': cohortYml(['test-one']).replace(
        '  - test-one\n',
        '  - test-one\n  - handle: test-three\n    track: python\n',
      ),
    })
    const r = enroll(config, opts({ pythonScaffold: fakePythonScaffold() }), new FakeGh(), collectIo())
    expect(r.track).toBe('python')
  })

  it('opens a whole cohort with each member on their recorded track', () => {
    const config = tempRepo({
      'cohorts/2027-01/cohort.yml': cohortYml(['test-one']).replace(
        '  - test-one\n',
        '  - test-one\n  - handle: test-two\n    track: python\n',
      ),
    })
    const report = openCohort(
      config,
      { id: '2027-01', mode: 'dry-run', retry: quiet },
      new FakeGh(),
      collectIo(),
    )
    expect(report.enrolled.map((r) => [r.handle, r.track])).toEqual([
      ['test-one', 'js'],
      ['test-two', 'python'],
    ])
  })
})

describe('new-task, by track', () => {
  it('works the track out from the cohort file, or from a python test file, else js', () => {
    const config = tempRepo({
      'cohorts/2027-01/cohort.yml': cohortYml(['test-one']).replace(
        '  - test-one\n',
        '  - test-one\n  - handle: test-two\n    track: python\n',
      ),
    })
    const labels = (handle: string, cohort: string) => {
      const io = collectIo()
      runNewTask(config, { stage: 1, handle, cohort }, null, io)
      return io.lines[1]
    }
    expect(labels('test-two', '2027-01')).toContain('track:python')
    expect(labels('test-one', '2027-01')).toContain('track:js')
    expect(labels('test-four', 'none')).toContain('track:js')
    mkdirSync(join(config.root, 'contributors', 'test-four'))
    writeFileSync(join(config.root, 'contributors', 'test-four', 'test_profile.py'), '')
    expect(labels('test-four', 'none')).toContain('track:python')
  })
})

describe('stage upkeep, by track', () => {
  it('keys templates by stage and track, and finds the block for an issue', () => {
    expect(templateKey('01-make-it-run.python.md')).toBe('1:python')
    expect(templateKey('02-your-page-exists.md')).toBe('2')
    expect(templateKey('README.md')).toBeNull()
    const templates = new Map([
      ['1:js', 'js block'],
      ['1:python', 'python block'],
      ['2', 'shared block'],
    ])
    expect(blockFor(templates, 1, trackOfLabels(['onboarding', 'stage:1', 'track:python']))).toBe(
      'python block',
    )
    expect(blockFor(templates, 1, trackOfLabels(['onboarding', 'stage:1']))).toBe('js block')
    expect(blockFor(templates, 2, 'python')).toBe('shared block')
  })
})
