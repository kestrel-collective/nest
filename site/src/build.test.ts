import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * Builds the real site from a fixture repository, the way Cloudflare Pages builds it from main, and
 * checks what comes out. NEST_ROOT points the site's data module at the fixture.
 */
const SITE_DIR = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const ASTRO = join(dirname(require.resolve('astro/package.json')), 'astro.js')
const temps: string[] = []

const PAGE = '## Where I started\n\nFixture text, not a real contributor.\n'
const profile = (handle: string, page: 'public' | 'private', name = `Fixture ${handle}`) =>
  [
    `handle: ${handle}`,
    `name: ${name}`,
    'cohort: 2027-01',
    'joined: 2027-01-12',
    'intro: Fixture text, not a real contributor.',
    'visibility:',
    `  page: ${page}`,
    '',
  ].join('\n')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'nest-site-'))
  temps.push(root)
  const all: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'fixture',
      version: '9.9.9',
      repository: 'github:example-org/nest',
      homepage: 'https://nest.example.test',
    }),
    'cohorts/2027-01/cohort.yml':
      'id: 2027-01\nname: January 2027 cohort\nstarts: 2027-01-12\nends: 2027-04-30\nmembers:\n  - test-public\n  - test-private\n',
    ...files,
  }
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

function build(root: string) {
  const out = mkdtempSync(join(tmpdir(), 'nest-site-out-'))
  temps.push(out)
  const r = spawnSync(process.execPath, [ASTRO, 'build', '--root', SITE_DIR, '--outDir', out], {
    // the fixture has no data file, so the site computes it with @nest/schema, as on a machine without Python
    env: { ...process.env, NEST_ROOT: root, NEST_INDEX_FALLBACK: '1', ASTRO_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const read = (path: string) => readFileSync(join(out, path), 'utf8')
  return { status: r.status, log: `${r.stdout}\n${r.stderr}`, out, read }
}

afterAll(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('site build from contributors/', () => {
  it('builds the public page and its list entries, and nothing for the private profile', () => {
    const root = fixture({
      'contributors/test-public/profile.yml': profile('test-public', 'public', 'Public Fixture'),
      'contributors/test-public/page.md': PAGE,
      'contributors/test-private/profile.yml': profile('test-private', 'private', 'Private Fixture'),
      'contributors/test-private/page.md': PAGE,
    })
    const b = build(root)
    expect(b.status, b.log).toBe(0)

    expect(existsSync(join(b.out, 'p', 'test-public', 'index.html'))).toBe(true)
    expect(existsSync(join(b.out, 'p', 'test-private'))).toBe(false)
    expect(b.read('p/test-public/index.html')).toContain('Public Fixture')

    const feed = JSON.parse(b.read('api/pages.json')) as { release: string; pages: { handle: string }[] }
    expect(feed.release).toBe('9.9.9')
    expect(feed.pages.map((p) => p.handle)).toEqual(['test-public'])

    for (const page of ['index.html', 'cohorts/2027-01/index.html']) {
      const html = b.read(page)
      expect(html, page).toContain('/p/test-public/')
      expect(html, page).not.toContain('test-private')
      expect(html, page).not.toContain('Private Fixture')
    }
  }, 180_000)

  it('stops the build on an invalid public profile, naming the file, line and field', () => {
    const root = fixture({
      'contributors/test-public/profile.yml': profile('test-public', 'public').replace(
        'intro: Fixture text, not a real contributor.',
        'intro: Replace this with one or two sentences.',
      ),
      'contributors/test-public/page.md': PAGE,
    })
    const b = build(root)
    expect(b.status).not.toBe(0)
    expect(b.log).toMatch(/contributors\/test-public\/profile\.yml:\d+ intro: still has the template text/)
  }, 180_000)
})
