import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageError } from './args.js'
import { BANK, DEFECTS } from './defects.js'
import { importCandidates, readChecks, readHeader } from './defect-bank/candidates.js'
import { recordChecks } from './defect-bank/check.js'
import { promote, promoted } from './defect-bank/promote.js'
import { CANDIDATES_DIR, PROMOTED_DIR } from './defect-bank/request.js'
import { GOOD_OUTPUT, runnerRow } from './defect-bank/test-fixtures.js'
import { cleanup, tempRepo } from './test-support.js'

afterEach(cleanup)

const passed = (root: string, id: string) =>
  recordChecks(root, [{ id, pass: true, reason: '', visible: true }], new Date('2026-10-27T09:00:00Z'))

describe('defect-promote', () => {
  it('moves a passed candidate into the bank with the next number, its provenance and who promoted it', () => {
    const config = tempRepo()
    importCandidates(
      config.root,
      [
        runnerRow(GOOD_OUTPUT, 'r1-01'),
        runnerRow(
          {
            ...GOOD_OUTPUT,
            id: 'second-one',
            module: GOOD_OUTPUT.module.replace("'skill-is-placeholder'", "'second-one'"),
          },
          'r1-02',
        ),
      ],
      [],
    )
    passed(config.root, 'skill-is-placeholder')
    const result = promote(config.root, 'skill-is-placeholder', {
      by: 'A Maintainer',
      at: new Date('2026-10-28T12:00:00Z'),
    })
    expect(result.number).toBe(6)
    const dir = join(config.root, PROMOTED_DIR)
    expect(existsSync(join(config.root, CANDIDATES_DIR, 'skill-is-placeholder.ts'))).toBe(false)
    const source = readFileSync(join(dir, 'skill-is-placeholder.ts'), 'utf8')
    expect(readHeader(source)).toMatchObject({
      model: 'claude-opus-5-5',
      prompt_version: 'nest_defect_v1',
      generated_at: '2026-10-27T10:00:00+00:00',
      status: 'promoted',
      number: '6',
      promoted_by: 'A Maintainer',
      promoted_at: '2026-10-28T12:00:00.000Z',
    })
    expect(source).toContain("from '../defect-bank/types.js'")
    expect(source).toContain("from '../templates.js'")
    expect(existsSync(join(dir, 'skill-is-placeholder.test.ts'))).toBe(true)
    expect(readChecks(config.root)['skill-is-placeholder']).toBeUndefined()
    const bank = readFileSync(join(dir, 'bank.ts'), 'utf8')
    expect(bank).toContain("import d6 from './skill-is-placeholder.js'")
    expect(bank).toContain('{ number: 6, defect: d6 }')

    passed(config.root, 'second-one')
    expect(promote(config.root, 'second-one', { by: 'A Maintainer' }).number).toBe(7)
    expect(promoted(config.root).map((p) => [p.id, p.number, p.tier])).toEqual([
      ['skill-is-placeholder', 6, 1],
      ['second-one', 7, 1],
    ])
  }, 60_000)

  it('refuses a candidate that has not passed the gate, or does not exist', () => {
    const config = tempRepo()
    importCandidates(config.root, [runnerRow(GOOD_OUTPUT)], [])
    expect(() => promote(config.root, 'skill-is-placeholder')).toThrow(/has not passed the gate/)
    recordChecks(config.root, [
      { id: 'skill-is-placeholder', pass: false, reason: 'the test passes', visible: true },
    ])
    expect(() => promote(config.root, 'skill-is-placeholder')).toThrow(/\(the test passes\)/)
    expect(() => promote(config.root, 'nothing-here')).toThrow(UsageError)
  }, 60_000)

  it('starts from the first five, each in tier 1, before anything is promoted', () => {
    expect(BANK.slice(0, 5)).toEqual(DEFECTS)
    expect(DEFECTS.every((d) => d.tier === 1)).toBe(true)
  }, 60_000)
})
