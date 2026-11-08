import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPageStatus } from './commands/page-status.js'
import { collectIo } from './io.js'
import type { RepoConfig } from './root.js'
import { cleanup, tempRepo } from './test-support.js'

afterEach(cleanup)

const PAGE = '## Where I started\n\nFixture text, not a real contributor.\n'
const profile = (handle: string, page: string, intro = 'Fixture text, not a real contributor.') =>
  `handle: ${handle}\nname: Fixture ${handle}\ncohort: 2027-01\njoined: 2027-01-12\nintro: ${intro}\nvisibility:\n  page: ${page}\n`

function write(config: RepoConfig, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(config.root, path, '..'), { recursive: true })
    writeFileSync(join(config.root, path), content)
  }
}

/** Commits everything in the fixture on a branch called main. */
function commit(config: RepoConfig, message: string): void {
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args], {
      cwd: config.root,
      stdio: 'pipe',
    })
  try {
    git('rev-parse', '--git-dir')
  } catch {
    git('init', '-q', '-b', 'main')
  }
  git('add', '-A')
  git('commit', '-q', '-m', message)
}

function status(config: RepoConfig, handle: string, opts: { ref?: string; local?: boolean } = {}) {
  const io = collectIo()
  const code = runPageStatus(config, { handle, ref: opts.ref ?? 'main', fetch: false, ...opts }, io)
  return { code, text: io.lines.join('\n') }
}

describe('page-status', () => {
  it('says a public, valid page on main appears, with its list entries and URL', () => {
    const config = tempRepo({
      'contributors/test-one/profile.yml': profile('test-one', 'public'),
      'contributors/test-one/page.md': PAGE,
      'contributors/test-two/profile.yml': profile('test-two', 'private'),
      'contributors/test-two/page.md': PAGE,
    })
    commit(config, 'fixture')
    const one = status(config, '@test-one')
    expect(one.code).toBe(0)
    expect(one.text).toMatch(/^Page status for @test-one on main \(commit [0-9a-f]+, \d{4}-\d{2}-\d{2}\)/)
    expect(one.text).toMatch(/profile\.yml\s+exists: contributors\/test-one\/profile\.yml/)
    expect(one.text).toMatch(/visibility\.page\s+public/)
    expect(one.text).toMatch(/validates\s+yes/)
    expect(one.text).toMatch(/page\s+yes/)
    expect(one.text).toMatch(/feed entry\s+yes/)
    expect(one.text).toMatch(/cohort page\s+yes, \/cohorts\/2027-01\//)
    expect(one.text).toMatch(/home page\s+yes/)
    expect(one.text).toContain('url               https://nest.example.test/p/test-one/')

    const two = status(config, 'test-two')
    expect(two.code).toBe(1)
    expect(two.text).toMatch(/visibility\.page\s+private/)
    expect(two.text).toMatch(/page\s+no/)
    expect(two.text).toContain('visibility.page is private. Set it to public in a pull request.')
  })

  it('reads main, not the working tree, unless --local is given', () => {
    const config = tempRepo({ 'contributors/test-one/profile.yml': profile('test-one', 'private') })
    write(config, { 'contributors/test-one/page.md': PAGE })
    commit(config, 'private page')
    write(config, { 'contributors/test-one/profile.yml': profile('test-one', 'public') })
    expect(status(config, 'test-one').code).toBe(1)
    expect(status(config, 'test-one', { local: true }).code).toBe(0)
  })

  it('names a missing profile, an invalid one, and problems elsewhere that stop the build', () => {
    const config = tempRepo({
      'contributors/test-one/profile.yml': profile('test-one', 'public', 'Replace this with a sentence.'),
      'contributors/test-one/page.md': PAGE,
      'contributors/test-two/profile.yml': profile('test-two', 'public'),
      'contributors/test-two/page.md': PAGE,
    })
    commit(config, 'fixture')

    const missing = status(config, 'test-three')
    expect(missing.code).toBe(1)
    expect(missing.text).toMatch(/profile\.yml\s+not found/)
    expect(missing.text).toContain('is not on main. The scaffold pull request for @test-three')

    const invalid = status(config, 'test-one')
    expect(invalid.text).toMatch(/validates\s+no, 1 problem:/)
    expect(invalid.text).toMatch(/contributors\/test-one\/profile\.yml:5 intro: still has the template text/)

    const blocked = status(config, 'test-two')
    expect(blocked.code).toBe(1)
    expect(blocked.text).toMatch(/validates\s+yes/)
    expect(blocked.text).toMatch(/site builds\s+no, 1 problem in the repository/)
    expect(blocked.text).toContain('1 problem in other files stop the whole site from building')
  })
})
