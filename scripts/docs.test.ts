import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

describe('documentation', () => {
  it('keeps every ADR under 25 lines', () => {
    const dir = join(ROOT, 'docs', 'adr')
    const records = readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f))
    expect(records.length).toBeGreaterThan(0)
    for (const file of records) {
      const lines = readFileSync(join(dir, file), 'utf8').trimEnd().split('\n').length
      expect(lines, file).toBeLessThan(25)
    }
  })

  it('has every document the site and the stage issues link to', () => {
    for (const path of [
      'docs/CONTRIBUTING.md',
      'docs/PRIVACY.md',
      'docs/roadmap.md',
      'docs/GOVERNANCE.md',
      'CHANGELOG.md',
      'CODE_OF_CONDUCT.md',
      'SECURITY.md',
      'CONTRIBUTORS.md',
      'LICENSE',
    ]) {
      expect(existsSync(join(ROOT, path)), path).toBe(true)
    }
  })

  it('has an issue body for every stage', () => {
    const files = readdirSync(join(ROOT, 'stages'))
    for (let n = 1; n <= 7; n++) {
      expect(
        files.some((f) => f.startsWith(`0${n}-`) && f.endsWith('.md')),
        `stage ${n}`,
      ).toBe(true)
    }
  })
})

describe('instructions for both tracks (ADR 0010)', () => {
  // The guides a contributor reads before choosing a track, or whatever their track. Track-specific
  // files (stages/*.js.md, stages/*.python.md, py/README.md, a member's own README) are left out.
  const GUIDES = [
    'README.md',
    'docs/CONTRIBUTING.md',
    'docs/DEVELOPMENT.md',
    'contributors/README.md',
    'cohorts/README.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ]
  // A js instruction, and what the same guide must also say for the python track.
  const PAIRS: [string, string][] = [
    ['npm run validate', 'nest validate'],
    ['npm test', 'pytest'],
    ['npm run dev', 'Cloudflare'],
    ['profile.test.ts', 'test_profile.py'],
    ['Node 20', 'Python 3.11'],
  ]

  it.each(GUIDES.map((g) => [g]))('%s gives the python track whatever it gives the js track', (guide) => {
    const text = readFileSync(join(ROOT, guide), 'utf8')
    for (const [js, python] of PAIRS) {
      if (text.includes(js)) expect(text, `${guide} says "${js}" but not "${python}"`).toContain(python)
    }
  })

  it('shows a python-track member in the cohort file example', () => {
    expect(readFileSync(join(ROOT, 'cohorts/README.md'), 'utf8')).toMatch(
      /- handle: [a-z-]+.*\n\s+track: python/,
    )
  })
})
