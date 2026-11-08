/**
 * The js track's half of the defect bank, called by nest_data's defect commands for js candidates
 * (ADR 0010). Not a public command: maintainers run `nest defect-*` from py/, which calls this for any
 * candidate that is TypeScript, since only Node can load those modules and run their vitest.
 *
 *   node packages/cli/dist/defect-bank/js-entry.js import <runner-output.jsonl>
 *   node packages/cli/dist/defect-bank/js-entry.js check <id>... | --all
 *   node packages/cli/dist/defect-bank/js-entry.js promote <id> --number <n>
 */
import { relative } from 'node:path'
import { runDefectCheck } from '../commands/defect-check.js'
import { runDefectImport } from '../commands/defect-import.js'
import { consoleIo } from '../io.js'
import { findRoot, readConfig } from '../root.js'
import { promote } from './promote.js'

export async function jsEntry(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv
  const config = readConfig(findRoot())
  const io = consoleIo
  if (command === 'import' && args[0]) return runDefectImport(config, args[0], io)
  if (command === 'check') {
    if (args.includes('--all')) return runDefectCheck(config, { all: true }, io)
    let code = 0
    for (const id of args) code = Math.max(code, await runDefectCheck(config, { id }, io))
    return code
  }
  if (command === 'promote' && args[0]) {
    const at = args.indexOf('--number')
    const number = at >= 0 ? Number(args[at + 1]) : undefined
    const { number: n, files } = promote(config.root, args[0], number === undefined ? {} : { number })
    io.out(`Promoted ${args[0]} as defect ${n} on the js track.`)
    for (const f of files) io.out(`  ${relative(config.root, f).replace(/\\/g, '/')}`)
    io.out('Run npm test and npm run typecheck, then commit the files above.')
    return 0
  }
  io.err('usage: js-entry.js import <file> | check <id>... | --all | promote <id> --number <n>')
  return 2
}

if (process.argv[1] && /js-entry\.[jt]s$/.test(process.argv[1]))
  jsEntry(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e))
      process.exitCode = 2
    },
  )
