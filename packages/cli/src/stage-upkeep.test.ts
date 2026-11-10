import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderIssue } from './issue-body.js'
import { readConfig } from './root.js'
import {
  checkSharedPool,
  checkTicketRewrite,
  stageIssueVars,
  ticketFields,
  handleFromTitle,
  POOL_MINIMUM,
  issuesToAssign,
  refreshBody,
  renderBlock,
  stageOf,
  templateBlock,
  type OpenStageIssue,
} from './stage-upkeep.js'
import { REAL_ROOT } from './test-support.js'

const issue = (over: Partial<OpenStageIssue>): OpenStageIssue => ({
  number: 5,
  title: 'Stage 1: Make it run (@anod-a)',
  body: '',
  labels: ['onboarding', 'stage:1'],
  assignees: [],
  ...over,
})

describe('assigning stage issues', () => {
  it('reads the handle from the title and the stage from the labels', () => {
    expect(handleFromTitle('Stage 3: Fix your defect (@Anod-a)')).toBe('anod-a')
    expect(handleFromTitle('Something else')).toBeNull()
    expect(stageOf(['onboarding', 'stage:4'])).toBe(4)
    expect(stageOf(['onboarding'])).toBeNull()
  })

  it('assigns only unassigned onboarding issues whose owner is a collaborator', () => {
    const issues = [
      issue({ number: 5 }),
      issue({ number: 6, assignees: ['anod-a'] }),
      issue({ number: 7, title: 'Stage 1: Make it run (@not-yet)' }),
      issue({ number: 8, labels: ['good-shared-issue'] }),
    ]
    expect(issuesToAssign(issues, (h) => h === 'anod-a')).toEqual([{ number: 5, handle: 'anod-a' }])
  })
})

describe('checking the shared pool', () => {
  const pool = (number: number, labels: string[]) => ({ number, title: `Shared ${number}`, labels })
  const full = (number: number, track: string) =>
    pool(number, ['good-shared-issue', 'stage:5', `track:${track}`])
  const healthy = [
    full(1, 'js'),
    full(2, 'js'),
    full(3, 'js'),
    full(4, 'python'),
    full(5, 'python'),
    full(6, 'python'),
  ]

  it('finds nothing wrong with three fully labelled issues on each track', () => {
    expect(POOL_MINIMUM).toBe(3)
    expect(checkSharedPool(healthy)).toEqual([])
  })

  it('reports an issue without stage:5, on either track, with the command that fixes it', () => {
    const problems = checkSharedPool([
      ...healthy,
      pool(63, ['good-shared-issue', 'track:python']),
      pool(66, ['good-shared-issue', 'stage:4', 'track:js']),
    ])
    expect(problems.map((p) => [p.kind, 'number' in p ? p.number : null])).toEqual([
      ['no-stage', 63],
      ['no-stage', 66],
    ])
    expect(problems[0]?.message).toContain('gh issue edit 63 --add-label stage:5')
  })

  it('reports an issue without a track label, or with a track Nest does not have', () => {
    const problems = checkSharedPool([
      ...healthy,
      pool(70, ['good-shared-issue', 'stage:5']),
      pool(71, ['good-shared-issue', 'stage:5', 'track:go']),
    ])
    expect(problems.map((p) => p.kind)).toEqual(['no-track', 'no-track'])
    expect(problems[0]?.message).toContain('track:js or track:python')
  })

  it('reports both labels missing on one issue', () => {
    const problems = checkSharedPool([...healthy, pool(72, ['good-shared-issue'])])
    expect(problems.map((p) => p.kind)).toEqual(['no-stage', 'no-track'])
  })

  it('fails a track with fewer than three open issues, naming the count', () => {
    const problems = checkSharedPool(healthy.filter((i) => i.number !== 3))
    expect(problems).toEqual([expect.objectContaining({ kind: 'too-few', track: 'js', open: 2 })])
    expect(problems[0]?.message).toContain('--track js')
  })

  it('fails both tracks when the pool is empty, which is how it stood for js before 2026-11-08', () => {
    const kinds = checkSharedPool([]).map((p) => (p.kind === 'too-few' ? `${p.track}:${p.open}` : p.kind))
    expect(kinds).toEqual(['js:0', 'python:0'])
  })

  it('counts only the shared pool', () => {
    const others = [pool(5, ['onboarding', 'stage:5', 'track:js']), pool(9, ['bug', 'track:js'])]
    expect(checkSharedPool([...healthy, ...others])).toEqual([])
  })
})

describe('refreshing the kestrel-ticket block', () => {
  const template = readFileSync(join(REAL_ROOT, 'stages', '01-make-it-run.js.md'), 'utf8')
  const fresh = renderBlock(templateBlock(template) ?? '', {
    handle: 'anod-a',
    repoUrl: 'https://github.com/kestrel-collective/nest',
  })

  it('every stage template carries a block in the shape Kestrel validates', () => {
    // every body, each track's variant included (ADR 0010)
    for (const name of readdirSync(join(REAL_ROOT, 'stages')).filter((n) => /^0\d-/.test(n))) {
      const block = templateBlock(readFileSync(join(REAL_ROOT, 'stages', name), 'utf8')) ?? ''
      for (const key of [
        'competency:',
        'level:',
        'difficulty:',
        'kp:',
        'evidence_kind:',
        'reserved_for:',
        'stage:',
        'steps:',
        'acceptance_criteria:',
        'resources:',
      ])
        expect(block, `${name} ${key}`).toContain(`\n${key}`)
      for (const old of ['cohort:', 'evidence:', 'title: {{', 'done_when:'])
        expect(block, `${name} ${old}`).not.toContain(`\n${old}`)
    }
  })

  it('replaces an old block, leaves a current one alone, and appends when there is none', () => {
    const old = 'Hello.\n\n```kestrel-ticket\nstage: 1\ndone_when:\n  - x\n```\n'
    const updated = refreshBody(old, fresh)
    expect(updated).toContain(fresh)
    expect(updated).not.toContain('done_when')
    expect(refreshBody(updated ?? '', fresh)).toBeNull()
    expect(refreshBody('No block here.', fresh)).toBe(`No block here.\n\n${fresh}\n`)
    expect(fresh).toContain('reserved_for: anod-a')
    expect(fresh).toContain('https://github.com/kestrel-collective/nest/blob/main/docs/CONTRIBUTING.md')
  })
})

describe('rewriting a stage issue from its current text', () => {
  const config = readConfig(REAL_ROOT)
  const opened = (track: 'js' | 'python', name: string) => {
    const r = renderIssue(config, 2, { handle: 'viktor-at-dev', name, cohort: '2026-11-09', track })
    return { title: r.title, body: r.body, labels: r.labels }
  }

  it('recovers what enrolment rendered the issue with, so a rewrite renders the same issue', () => {
    for (const track of ['js', 'python'] as const) {
      const issue = opened(track, 'Victor O. Mwangi')
      const vars = stageIssueVars(issue)
      expect(vars).toEqual({
        stage: 2,
        handle: 'viktor-at-dev',
        name: 'Victor O. Mwangi',
        cohort: '2026-11-09',
        track,
      })
      expect(renderIssue(config, 2, vars!).body).toBe(issue.body)
    }
  })

  it('falls back to @handle for the name, and none for an issue with no cohort label', () => {
    const vars = stageIssueVars({
      title: 'Stage 2: Your page exists (@a-b)',
      body: 'No greeting.',
      labels: ['onboarding', 'stage:2'],
    })
    expect(vars).toMatchObject({ name: '@a-b', cohort: 'none', track: 'js' })
    expect(
      stageIssueVars({ title: 'Something else', body: '', labels: ['onboarding', 'stage:2'] }),
    ).toBeNull()
    expect(stageIssueVars({ title: 'Stage 2: x (@a-b)', body: '', labels: ['stage:2'] })).toBeNull()
  })

  it('accepts new instructions and a new acceptance line with every fixed key unchanged', () => {
    const now = opened('python', 'Victor').body
    const older = now
      .replace(/guide: "On the branch [^"]*"/, 'guide: "Fill in profile.yml and page.md in your own words."')
      .replace('  - "Your scaffold pull request merged"\n', '')
    expect(checkTicketRewrite(older, now)).toBeNull()
    expect([...(ticketFields(now)?.keys() ?? [])]).toEqual([
      'competency',
      'level',
      'difficulty',
      'kp',
      'evidence_kind',
      'reserved_for',
      'stage',
      'steps',
      'acceptance_criteria',
      'resources',
    ])
  })

  it('refuses a rewrite that changes a key that is not an instruction, or drops one', () => {
    const now = opened('js', 'Victor').body
    expect(checkTicketRewrite(now.replace('kp: 1', 'kp: 0'), now)).toBe('the new block changes kp (0 to 1)')
    expect(
      checkTicketRewrite(now, now.replace('reserved_for: viktor-at-dev', 'reserved_for: someone')),
    ).toContain('reserved_for')
    expect(checkTicketRewrite(now, now.replace(/\nresources:[\s\S]*?\n```/, '\n```'))).toBe(
      'the new block lacks resources',
    )
    expect(checkTicketRewrite(now, 'No block.')).toBe('the new body has no kestrel-ticket block')
  })
})
