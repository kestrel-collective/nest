import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runNewTask } from './commands/new-task.js'
import { scaffold } from './commands/scaffold.js'
import { runValidate } from './commands/validate.js'
import { FakeGh } from './gh-fakes.js'
import { collectIo } from './io.js'
import { fillTemplate, issueTitle, renderIssue } from './issue-body.js'
import { cleanup, tempRepo } from './test-support.js'

afterEach(cleanup)

describe('validate command', () => {
  it('reports no problems for an empty repository', () => {
    const io = collectIo()
    expect(runValidate(tempRepo(), io)).toBe(0)
    expect(io.lines).toEqual(['Checked 0 contributor directories, 0 templates and 1 cohort: no problems.'])
  })

  it('prints each problem as file:line field: sentence and exits 1', () => {
    const config = tempRepo()
    scaffold(config, { handle: 'test-one', defect: 'none' })
    const profile = join(config.root, 'contributors', 'test-one', 'profile.yml')
    const text = readFileSync(profile, 'utf8').replace('page: private', 'page: public')
    writeFileSync(profile, text)
    const io = collectIo()
    expect(runValidate(config, io)).toBe(1)
    expect(io.errors[0]).toMatch(
      'contributors/test-one/page.md:1 Where I started: still has the template text',
    )
    expect(io.errors).toContainEqual(
      expect.stringContaining('contributors/test-one/profile.yml:4 name: still has the template text'),
    )
    expect(io.errors).toContainEqual(
      expect.stringContaining('contributors/test-one/profile.yml:7 intro: still has the template text'),
    )
    expect(io.errors.at(-1)).toMatch(/problems found/)
  })
})

describe('new-task command', () => {
  it('prints the filled issue without gh', () => {
    const config = tempRepo()
    const io = collectIo()
    expect(runNewTask(config, { stage: 3, handle: 'test-one' }, null, io)).toBe(0)
    expect(io.lines[0]).toBe('# Stage 3: Fix your defect (@test-one)')
    expect(io.lines[1]).toContain('onboarding, cohort:2027-01, stage:3')
    expect(io.lines.join('\n')).toContain('https://nest.example.test/p/test-one/')
    expect(io.lines.join('\n')).not.toContain('{{')
  })

  it('creates the issue with gh, and skips it the second time', () => {
    const config = tempRepo()
    const gh = new FakeGh()
    runNewTask(config, { stage: 1, handle: 'test-one' }, gh, collectIo())
    expect(gh.issues).toHaveLength(1)
    expect(gh.issues[0]).toMatchObject({
      title: 'Stage 1: Make it run (@test-one)',
      milestone: '2027-01',
      assignee: 'test-one',
    })
    const io = collectIo()
    runNewTask(config, { stage: 1, handle: 'test-one' }, gh, io)
    expect(gh.issues).toHaveLength(1)
    expect(io.lines[0]).toMatch(/^Skipped/)
  })

  it('rejects a stage outside 1 to 7', () => {
    expect(() => runNewTask(tempRepo(), { stage: 9, handle: 'test-one' }, null, collectIo())).toThrow(
      /1 to 7/,
    )
  })
})

describe('issue bodies', () => {
  it('fills placeholders and leaves unknown ones alone', () => {
    expect(fillTemplate('Hi {{name}} from {{cohort}} {{unknown}}', { name: 'A', cohort: 'B' })).toBe(
      'Hi A from B {{unknown}}',
    )
  })

  it('renders a title in the agreed form', () => {
    const config = tempRepo()
    const issue = renderIssue(config, 7, { handle: 'test-two', cohort: '2027-01' })
    expect(issue.title).toBe(issueTitle(issue.stage, 'test-two'))
    expect(issue.title).toBe('Stage 7: Propose something (@test-two)')
    expect(issue.body).toContain('https://github.com/example-org/nest')
  })
})
