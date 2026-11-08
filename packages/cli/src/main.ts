import { flagBool, flagString, parseArgs, UsageError } from './args.js'
import { isTrack, TRACKS, type Track } from '@nest/schema'
import { enroll, type EnrollMode } from './commands/enroll.js'
import { runNewTask } from './commands/new-task.js'
import { cohortOpen } from './commands/cohort-open.js'
import { openCohort } from './commands/open-cohort.js'
import { scaffold } from './commands/scaffold.js'
import { runValidate } from './commands/validate.js'
import { withdraw } from './commands/withdraw.js'
import { GhCli } from './gh-cli.js'
import { NullGh } from './gh-fakes.js'
import type { Gh } from './gh.js'
import { CLI_VERSION } from './index.js'
import { consoleIo } from './io.js'
import { NO_COHORT } from './issue-body.js'
import { findRoot, readConfig } from './root.js'

const USAGE = `nest ${CLI_VERSION}

Usage: nest <command> [options]

  validate                         Check every contributor and cohort directory.
  scaffold <handle>                Create contributors/<handle>/ from the template.
      [--cohort <id|none>] [--defect <number|id|none>] [--force] [--template]
  new-task <stage> --handle <h>    Print the issue for a stage, or create it with --gh.
      [--cohort <id|none>] [--track js|python] [--gh] [--dry-run]
  enroll <handle>                  Cohort files, scaffold PR, invitation and stage issues for one person.
      --name "<Name>" --cohort <id|none> [--track js|python] [--gh] [--dry-run]
  open-cohort <id>                 Enrol every member of a cohort.
      [--gh] [--dry-run]
  cohort-open <id>                 Create cohorts/<id>/cohort.yml on main for a cohort the platform opened.
      --name "<Name>" --starts YYYY-MM-DD --ends YYYY-MM-DD [--gh] [--dry-run]
  withdraw <handle>                Close and rename the person's stage issues and close their open
      [--gh] [--dry-run]           pull requests, so a new enrolment starts them afresh.

Every command accepts --root <dir>. Without it the repository is found from the current directory.
--dry-run prints what would happen and makes no GitHub calls. Without --gh the bodies are printed instead.`

/** --track js|python, or undefined when it is left out. */
function trackFlag(flags: Record<string, string | true>): Track | undefined {
  const value = flagString(flags, 'track')
  if (value === undefined) return undefined
  if (!isTrack(value)) throw new UsageError(`--track must be ${TRACKS.join(' or ')}, not "${value}".`)
  return value
}

/** The data commands that moved to nest_data (py/) and are no longer here. */
const PYTHON_COMMANDS = [
  'build-data',
  'page-status',
  'feed',
  'practice-counts',
  'defect-request',
  'defect-import',
  'defect-check',
  'defect-promote',
]

function modeFor(wantGh: boolean, dryRun: boolean): EnrollMode {
  return dryRun ? 'dry-run' : wantGh ? 'apply' : 'print'
}

function ghFor(config: { root: string; slug: string }, mode: EnrollMode): Gh {
  if (mode !== 'apply') return new NullGh()
  if (!GhCli.available())
    throw new UsageError('GitHub CLI (gh) is not installed or not on PATH, so --gh cannot be used.')
  return new GhCli(
    config.root,
    config.slug,
    process.env.NEST_ADMIN_TOKEN ?? '',
    process.env.NEST_MAIN_TOKEN ?? '',
  )
}

export function main(argv: readonly string[]): number | Promise<number> {
  const { command, positionals, flags } = parseArgs(argv)
  const io = consoleIo
  if (command === undefined || command === 'help' || flagBool(flags, 'help')) {
    io.out(USAGE)
    return 0
  }
  if (command === '--version' || command === 'version' || flagBool(flags, 'version')) {
    io.out(`nest ${CLI_VERSION}`)
    return 0
  }
  const root = flagString(flags, 'root') ?? findRoot()
  const config = readConfig(root)
  const dryRun = flagBool(flags, 'dry-run')
  const wantGh = flagBool(flags, 'gh')
  const mode = modeFor(wantGh, dryRun)

  switch (command) {
    case 'validate':
      return runValidate(config, io)
    case 'scaffold': {
      const handle = positionals[0]
      if (!handle) throw new UsageError('scaffold needs a handle: nest scaffold <handle>')
      const result = scaffold(config, {
        handle,
        cohort: flagString(flags, 'cohort'),
        defect: flagString(flags, 'defect'),
        template: flagBool(flags, 'template'),
        force: flagBool(flags, 'force'),
      })
      io.out(
        `Created contributors/${handle}/ with ${Object.keys(result.files).join(', ')} (cohort ${result.cohort ?? NO_COHORT}).`,
      )
      if (result.defect)
        io.out(`Planted defect ${result.defect.number}, ${result.defect.id}: ${result.defect.symptom}`)
      return 0
    }
    case 'new-task': {
      const stage = Number(positionals[0])
      const handle = flagString(flags, 'handle')
      if (!positionals[0] || !Number.isInteger(stage))
        throw new UsageError('new-task needs a stage number: nest new-task <1-7> --handle <handle>')
      if (!handle) throw new UsageError('new-task needs --handle <handle>.')
      const gh = wantGh ? ghFor(config, dryRun ? 'dry-run' : 'apply') : null
      return runNewTask(
        config,
        { stage, handle, cohort: flagString(flags, 'cohort'), track: trackFlag(flags), dryRun },
        gh,
        io,
      )
    }
    case 'enroll': {
      const handle = positionals[0]
      const cohort = flagString(flags, 'cohort')
      if (!handle)
        throw new UsageError('enroll needs a handle: nest enroll <handle> --name "<Name>" --cohort <id|none>')
      if (!cohort) throw new UsageError(`enroll needs --cohort <id> or --cohort ${NO_COHORT}.`)
      const report = enroll(
        config,
        { handle, name: flagString(flags, 'name'), cohort, track: trackFlag(flags), mode },
        ghFor(config, mode),
        io,
      )
      return report.failed ? 1 : 0
    }
    case 'withdraw': {
      const handle = positionals[0]
      if (!handle) throw new UsageError('withdraw needs a handle: nest withdraw <handle>')
      const report = withdraw({ handle, mode }, ghFor(config, mode), io)
      return report.failed ? 1 : 0
    }
    case 'cohort-open': {
      const id = positionals[0]
      if (!id)
        throw new UsageError('cohort-open needs a cohort id: nest cohort-open <id> --name "<Name>" ...')
      const report = cohortOpen(
        {
          id,
          name: flagString(flags, 'name'),
          starts: flagString(flags, 'starts'),
          ends: flagString(flags, 'ends'),
          mode,
        },
        ghFor(config, mode),
        io,
      )
      return report.failed ? 1 : 0
    }
    case 'open-cohort': {
      const id = positionals[0]
      if (!id) throw new UsageError('open-cohort needs a cohort id: nest open-cohort <id>')
      const report = openCohort(config, { id, mode }, ghFor(config, mode), io)
      return report.failed.length > 0 ? 1 : 0
    }
    default:
      if (PYTHON_COMMANDS.includes(command))
        throw new UsageError(
          `${command} is a command of the python track's nest (ADR 0010). Run it from py/: python -m nest_data ${command}, or see py/README.md.`,
        )
      throw new UsageError(`Unknown command "${command}". Run nest help to see the commands.`)
  }
}

function onError(e: unknown): void {
  if (e instanceof UsageError) {
    console.error(e.message)
    process.exitCode = 2
  } else throw e
}

try {
  const code = main(process.argv.slice(2))
  if (typeof code === 'number') process.exitCode = code
  else
    code.then(
      (c) => {
        process.exitCode = c
      },
      (e: unknown) => {
        try {
          onError(e)
        } catch (err) {
          console.error(err)
          process.exitCode = 1
        }
      },
    )
} catch (e) {
  onError(e)
}
