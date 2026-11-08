import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const WORKFLOWS = join(ROOT, '.github', 'workflows')

type Job = { 'runs-on'?: string; steps?: { run?: string; uses?: string }[] }
type Workflow = { name?: string; on?: unknown; jobs?: Record<string, Job> }

/** act is not installed here, so this is the closest check: every workflow parses and references real files. */
describe('GitHub configuration as code', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))

  it('has the nine workflows', () => {
    expect(files.sort()).toEqual([
      'auto-merge.yml',
      'ci.yml',
      'cohort.yml',
      'enroll.yml',
      'labels.yml',
      'notify-landing.yml',
      'onboarding.yml',
      'practice-counts.yml',
      'withdraw.yml',
    ])
  })

  it.each(files)('%s parses, has jobs with runners and steps, and points at scripts that exist', (file) => {
    const wf = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
    expect(wf.name, 'name').toBeTruthy()
    expect(wf.on, 'on').toBeTruthy()
    const jobs = Object.values(wf.jobs ?? {})
    expect(jobs.length).toBeGreaterThan(0)
    for (const job of jobs) {
      expect(job['runs-on']).toBe('ubuntu-latest')
      expect(job.steps?.length).toBeGreaterThan(0)
      for (const step of job.steps ?? []) {
        const m = /node (\.github\/scripts\/[a-z-]+\.mjs)/.exec(step.run ?? '')
        if (m) expect(existsSync(join(ROOT, m[1]!)), m[1]).toBe(true)
        if (step.uses) expect(step.uses).toMatch(/^actions\/[a-z-]+@v\d+$/)
      }
    }
  })

  it('has issue templates that parse and carry a label', () => {
    const dir = join(ROOT, '.github', 'ISSUE_TEMPLATE')
    const forms = readdirSync(dir).filter((f) => f.endsWith('.yml') && f !== 'config.yml')
    expect(forms.length).toBe(4)
    for (const f of forms) {
      const form = parse(readFileSync(join(dir, f), 'utf8')) as {
        name?: string
        labels?: string[]
        body?: unknown[]
      }
      expect(form.name, f).toBeTruthy()
      expect(form.labels?.length, f).toBeGreaterThan(0)
      expect(form.body?.length, f).toBeGreaterThan(0)
    }
  })

  it('lists every stage label and the shared-issue label', () => {
    const labels = JSON.parse(readFileSync(join(ROOT, '.github', 'labels.json'), 'utf8')) as {
      name: string
    }[]
    const names = labels.map((l) => l.name)
    for (let n = 1; n <= 7; n++) expect(names).toContain(`stage:${n}`)
    expect(names).toContain('good-shared-issue')
    expect(names).toContain('onboarding')
  })
})
