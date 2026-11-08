#!/usr/bin/env node
// The data step (ADR 0010): runs `nest build-data` from py/ to write site/.nest/data.json, the file the
// site reads. `npm run build` and `npm run dev` run it first; so does the Cloudflare Pages build, whose
// command is `npm ci && npm run build`.
//
// It needs Python 3.11 or later. nest_data runs straight from py/; its one dependency (PyYAML) is
// installed into py/.deps the first time and again whenever py/pyproject.toml changes. No virtual
// environment is made, so nothing depends on how a platform launches one.
//
// In CI and on Cloudflare (CI or CF_PAGES set) a missing Python is an error. On your own machine it is
// not: the js track needs no Python, so the step removes any old data file and the site computes the
// same data with @nest/schema instead.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const PY = join(ROOT, 'py')
const DEPS = join(PY, '.deps')
const STAMP = join(DEPS, '.nest-installed')
const INDEX = join(ROOT, 'site', '.nest', 'data.json')
const STRICT = Boolean(process.env.CI || process.env.CF_PAGES) && process.env.NEST_DATA_STEP !== 'optional'
const windows = process.platform === 'win32'

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })

/** The first Python 3.11+ found, as [command, ...leading args]. */
function findPython() {
  const candidates = [
    ...(process.env.NEST_PYTHON ? [[process.env.NEST_PYTHON]] : []),
    ['python3'],
    ['python'],
    ...(windows ? [['py', '-3']] : []),
  ]
  for (const [cmd, ...pre] of candidates) {
    const r = run(cmd, [...pre, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'])
    if (r.status !== 0) continue
    const [major, minor] = r.stdout.trim().split('.').map(Number)
    if (major === 3 && minor >= 11) return [cmd, ...pre]
    console.error(`data step: ${cmd} is Python ${r.stdout.trim()}; nest_data needs 3.11 or later.`)
  }
  return null
}

function noPython(why) {
  if (STRICT) {
    console.error(
      `data step: ${why}, so site/.nest/data.json cannot be written.\n` +
        'On Cloudflare Pages set the environment variable PYTHON_VERSION to 3.12 (docs/REPO-SETTINGS.md).',
    )
    process.exit(1)
  }
  rmSync(INDEX, { force: true })
  console.log(
    `data step: ${why}, so the site computes its data with @nest/schema (the js track needs no Python).`,
  )
  process.exit(0)
}

/** Installs py/pyproject.toml's dependencies into py/.deps unless they are there already. */
function ensureDeps(python) {
  const pyproject = readFileSync(join(PY, 'pyproject.toml'))
  const want = createHash('sha256').update(pyproject).digest('hex')
  if (existsSync(STAMP) && readFileSync(STAMP, 'utf8') === want) return true
  const deps = run(python[0], [
    ...python.slice(1),
    '-c',
    'import sys, tomllib; print("\\n".join(tomllib.load(open(sys.argv[1], "rb"))["project"]["dependencies"]))',
    join(PY, 'pyproject.toml'),
  ])
  if (deps.status !== 0) return false
  rmSync(DEPS, { recursive: true, force: true })
  const pip = run(
    python[0],
    [
      ...python.slice(1),
      ...['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '--no-warn-script-location'],
      ...['--target', DEPS, ...deps.stdout.split('\n').filter(Boolean)],
    ],
    { stdio: 'inherit' },
  )
  if (pip.status !== 0) return false
  writeFileSync(STAMP, want)
  return true
}

const python = findPython()
if (!python) noPython('no Python 3.11 or later was found')
if (!ensureDeps(python)) noPython('nest_data could not install its dependency, PyYAML, into py/.deps')
const env = { ...process.env, PYTHONPATH: [PY, DEPS, process.env.PYTHONPATH].filter(Boolean).join(delimiter) }
const r = run(python[0], [...python.slice(1), '-m', 'nest_data', 'build-data', '--root', ROOT], {
  stdio: 'inherit',
  env,
})
process.exit(r.status ?? 1)
