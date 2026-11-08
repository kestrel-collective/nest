import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { candidateIds } from './defect-bank/candidates.js'
import { BANK } from './defects.js'
import { REAL_ROOT } from './test-support.js'

// ADR 0009: the Stage 3 and 4 issues say a defect exists, never which one.
// Every track's variant of both (ADR 0010).
const TEMPLATES = ['03-fix-your-defect', '04-write-the-test'].flatMap((s) => [
  `stages/${s}.js.md`,
  `stages/${s}.python.md`,
])

describe('stage templates and the defect bank', () => {
  const ids = [...BANK.map((d) => d.id), ...candidateIds(REAL_ROOT)]

  it.each(TEMPLATES)('%s names no defect id', (path) => {
    const text = readFileSync(join(REAL_ROOT, path), 'utf8').toLowerCase()
    expect(ids.filter((id) => text.includes(id))).toEqual([])
  })

  it('checks the whole bank', () => {
    expect(ids).toEqual(expect.arrayContaining(['joined-after-cohort', 'name-is-handle']))
  })
})
