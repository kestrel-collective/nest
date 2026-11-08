import { spawnSync } from 'node:child_process'
import { delimiter, join } from 'node:path'
import type { RepoConfig } from './root.js'

/**
 * A python-track scaffold is written by nest_data (`nest scaffold` in py/), which plants a defect from
 * the python bank and adds test_profile.py (ADR 0010). Enrolment calls it through this adapter, so the
 * enrolment tests can use a fake and the Enrol workflow uses the real one.
 */
export type PythonScaffoldResult = {
  /** The defect id planted, or null. */
  defect: string | null
  /** File names written (or that would be written) in contributors/<handle>/. */
  files: string[]
}

export type PythonScaffold = (
  config: RepoConfig,
  opts: { handle: string; cohort: string; today?: string | undefined; plan: boolean },
) => PythonScaffoldResult

const candidates = (): string[][] => [
  ...(process.env.NEST_PYTHON ? [[process.env.NEST_PYTHON]] : []),
  ['python3'],
  ['python'],
  ...(process.platform === 'win32' ? [['py', '-3']] : []),
]

/** Runs `python -m nest_data scaffold ... --json` with py/ (and py/.deps from the data step) importable. */
export const runPythonScaffold: PythonScaffold = (config, opts) => {
  const args = [
    '-m',
    'nest_data',
    'scaffold',
    opts.handle,
    '--cohort',
    opts.cohort,
    '--json',
    '--root',
    config.root,
  ]
  if (opts.plan) args.push('--plan')
  if (opts.today) args.push('--today', opts.today)
  const env = {
    ...process.env,
    PYTHONPATH: [join(config.root, 'py'), join(config.root, 'py', '.deps'), process.env.PYTHONPATH]
      .filter(Boolean)
      .join(delimiter),
  }
  let last = 'no Python 3.11+ was found (set NEST_PYTHON, or install it)'
  for (const [cmd, ...pre] of candidates()) {
    const r = spawnSync(cmd!, [...pre, ...args], { encoding: 'utf8', env })
    if (r.error) continue
    if (r.status === 0) return JSON.parse(r.stdout) as PythonScaffoldResult
    last = (r.stderr || r.stdout).trim().split('\n').at(-1) ?? `exit ${r.status}`
    break
  }
  throw new Error(`the python-track scaffold failed: ${last}`)
}
