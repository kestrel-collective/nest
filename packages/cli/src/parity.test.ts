import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { goldenFor, schemaCases, yamlCases } from './parity.js'
import { REAL_ROOT } from './test-support.js'

/**
 * @nest/schema is the js track's library and nest_data the python track's (ADR 0010). Both are held to the
 * same recorded behaviour in py/tests/golden: this test for Node, py/tests/test_parity.py for Python. A
 * change to a rule regenerates the goldens (py/tests/fixtures/README.md) and changes both in one pull request.
 */
const GOLDEN = join(REAL_ROOT, 'py', 'tests', 'golden')
const REPOS = join(REAL_ROOT, 'py', 'tests', 'fixtures', 'repos')
const read = (name: string) => JSON.parse(readFileSync(join(GOLDEN, name), 'utf8')) as unknown

describe('parity goldens', () => {
  it.each(readdirSync(REPOS).sort())('%s: validate, the data file and page-status still match', (name) => {
    expect(goldenFor(join(REPOS, name))).toEqual(read(`${name}.json`))
  })

  it('every schema case still matches', () => {
    expect(JSON.parse(JSON.stringify(schemaCases()))).toEqual(read('schema-cases.json'))
  })

  it('every YAML snippet still reads the same', () => {
    expect(JSON.parse(JSON.stringify(yamlCases()))).toEqual(read('yaml-cases.json'))
  })
})
