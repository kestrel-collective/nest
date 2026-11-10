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

type Step = {
  id?: string
  name?: string
  uses?: string
  run?: string
  if?: string
  with?: Record<string, string>
  env?: Record<string, string>
}
const steps = (file: string) =>
  ((parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as { jobs: Record<string, { steps: Step[] }> }).jobs
    .enroll?.steps ?? []) as Step[]
const APP_TOKEN = '${{ steps.app.outputs.token }}'

describe('the Enrol workflow writes as the Nest bot app', () => {
  const all = steps('enroll.yml')
  const at = (pred: (s: Step) => boolean) => all.findIndex(pred)
  const enrolStep = all.find((s) => s.name === 'Enrol')

  it('stops first, with a message, when either secret is missing', () => {
    const check = all[0]
    expect(check?.env?.APP_ID).toContain('secrets.NEST_BOT_APP_ID')
    expect(check?.env?.APP_KEY).toBe('${{ secrets.NEST_BOT_PRIVATE_KEY }}')
    expect(check?.run).toContain('::error title=Nest bot app not configured::')
    expect(check?.run).toContain('exit 1')
    expect(check?.run).toContain('docs/REPO-SETTINGS.md')
  })

  it('mints the token unconditionally, before checking out with it', () => {
    const mint = all[at((s) => s.id === 'app')]
    expect(mint?.uses).toMatch(/^actions\/create-github-app-token@/)
    expect(mint?.if).toBeUndefined()
    expect(mint?.with?.['private-key']).toBe('${{ secrets.NEST_BOT_PRIVATE_KEY }}')
    const checkout = at((s) => s.id === 'checkout')
    expect(at((s) => s.id === 'app')).toBeLessThan(checkout)
    expect(all[checkout]?.with?.token).toBe(APP_TOKEN)
  })

  it('runs enrolment with the app token for gh and main, and passes the app login', () => {
    expect(enrolStep?.env?.GH_TOKEN).toBe(APP_TOKEN)
    expect(enrolStep?.env?.NEST_MAIN_TOKEN).toBe(APP_TOKEN)
    expect(enrolStep?.env?.NEST_BOT_LOGIN).toBe('${{ steps.app.outputs.app-slug }}[bot]')
  })

  it('commits as the app, not as github-actions[bot]', () => {
    const identity = all.find((s) => s.run?.includes('git config user.name'))
    expect(identity?.run).toContain('${SLUG}[bot]')
    expect(identity?.run).not.toContain('github-actions')
  })

  it('keeps the workflow token for the failure issue only', () => {
    const uses = all.filter((s) => JSON.stringify(s).includes('GITHUB_TOKEN')).map((s) => s.name)
    expect(uses).toEqual(['Open or update the failure issue', 'Close an earlier failure issue'])
  })
})

describe('the auto-merge workflow', () => {
  const wf = parse(readFileSync(join(WORKFLOWS, 'auto-merge.yml'), 'utf8')) as {
    jobs: Record<string, { steps: Step[] }>
  }
  const all = wf.jobs['own-directory']?.steps ?? []

  it('gives the check the head branch, so a scaffold from the app counts as its member', () => {
    expect(all.find((s) => s.id === 'check')?.env?.PR_HEAD).toBe('${{ github.event.pull_request.head.ref }}')
  })

  it('enables auto-merge with the workflow token, never the app, which bypasses the rules on main', () => {
    const enable = all.find((s) => s.name === 'Enable auto-merge')
    expect(enable?.env?.GH_TOKEN).toBe('${{ github.token }}')
    expect(JSON.stringify(wf)).not.toContain('create-github-app-token')
  })
})
