import { CohortSchema, readYaml } from '@nest/schema'
import { describe, expect, it } from 'vitest'
import { UsageError } from './args.js'
import { cohortFileText, cohortOpen } from './commands/cohort-open.js'
import { FakeGh } from './gh-fakes.js'
import { collectIo } from './io.js'

const quiet = { sleep: () => {}, baseMs: 0 }
const PATH = 'cohorts/2026-11-02/cohort.yml'
const opts = (over = {}) => ({
  id: '2026-11-02',
  name: 'Cohort starting 2 November 2026',
  starts: '2026-11-02',
  ends: '2027-11-02',
  mode: 'apply' as const,
  retry: quiet,
  ...over,
})

describe('cohort-open', () => {
  it('commits a valid, empty cohort file to main, and leaves it alone the second time', () => {
    const gh = new FakeGh()
    const first = cohortOpen(opts(), gh, collectIo())
    expect(first).toMatchObject({ outcome: 'created', failed: false })
    expect(gh.commits).toHaveLength(1)
    expect(gh.commits[0]?.message).toBe('chore(cohort): open 2026-11-02')
    const text = gh.main.get(PATH) ?? ''
    expect(CohortSchema.safeParse(readYaml(text, PATH).data).success).toBe(true)
    expect(readYaml(text, PATH).data).toMatchObject({ id: '2026-11-02', members: [], ends: '2027-11-02' })

    const second = cohortOpen(opts({ name: 'Another name' }), gh, collectIo())
    expect(second).toMatchObject({ outcome: 'skipped', failed: false })
    expect(gh.commits).toHaveLength(1)
    expect(gh.main.get(PATH)).toBe(text)
  })

  it('makes no GitHub call in a dry run or print mode', () => {
    const gh = new FakeGh()
    const io = collectIo()
    expect(cohortOpen(opts({ mode: 'dry-run' }), gh, io).outcome).toBe('would create')
    expect(cohortOpen(opts({ mode: 'print' }), gh, io).outcome).toBe('would create')
    expect(gh.calls).toEqual([])
    expect(io.lines).toContain(`# ${PATH}`)
  })

  it('refuses a bad id, missing name or dates, and an end before the start', () => {
    const gh = new FakeGh()
    expect(() => cohortOpen(opts({ id: '2026-02-30' }), gh, collectIo())).toThrow(UsageError)
    expect(() => cohortOpen(opts({ name: ' ' }), gh, collectIo())).toThrow(/--name/)
    expect(() => cohortOpen(opts({ starts: '2026-11-2' }), gh, collectIo())).toThrow(/YYYY-MM-DD/)
    expect(() => cohortOpen(opts({ ends: '2026-10-01' }), gh, collectIo())).toThrow(/before it starts/)
    expect(gh.calls).toEqual([])
  })

  it('fails, without retrying, when main is protected', () => {
    const gh = new FakeGh()
    gh.protectedMain = true
    const r = cohortOpen(opts(), gh, collectIo())
    expect(r).toMatchObject({ outcome: 'failed', failed: true })
    expect(r.detail).toMatch(/protected/)
    expect(gh.calls.filter((c) => c.startsWith('commitToMain '))).toHaveLength(1)
  })

  it('quotes a name YAML would otherwise misread, the way Prettier formats it', () => {
    const text = cohortFileText('2027-01', 'Cohort: January', '2027-01-12', '2028-01-12')
    expect(readYaml(text, 'x').data).toMatchObject({ name: 'Cohort: January' })
    expect(text).toContain("name: 'Cohort: January'")
    const apostrophe = cohortFileText('2027-01', "Kestrel's cohort", '2027-01-12', '2028-01-12')
    expect(readYaml(apostrophe, 'x').data).toMatchObject({ name: "Kestrel's cohort" })
    expect(apostrophe).toContain(`name: "Kestrel's cohort"`)
  })
})
