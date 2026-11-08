import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  handleFromTitle,
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
