import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UsageError } from '../args.js'
import {
  field,
  header,
  prettierWrite,
  readChecks,
  readHeader,
  writeReadme,
  CHECKS_FILE,
} from './candidates.js'
import { CANDIDATES_DIR, PROMOTED_DIR } from './request.js'

/**
 * P2 item 4: a maintainer promotes a candidate that passed the gate. Its files move from
 * defects/candidates/ to defects/, it takes the next number from 6, the header records who
 * promoted it and when, and defects/bank.ts, which the bank reads, is written again.
 */
export const BANK_FILE = 'bank.ts'
export const FIRST_NUMBER = 6

export type Promoted = { id: string; number: number; tier: number }

/** Every promoted defect, read from the headers of the files in defects/. */
export function promoted(root: string): Promoted[] {
  const dir = join(root, PROMOTED_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== BANK_FILE)
    .map((f) => {
      const src = readFileSync(join(dir, f), 'utf8')
      return { id: f.slice(0, -3), number: Number(readHeader(src).number), tier: Number(field(src, 'tier')) }
    })
    .filter((p) => Number.isInteger(p.number))
    .sort((a, b) => a.number - b.number)
}

/** defects/bank.ts: the promoted defects in number order, each with the number it was given. */
export function writeBank(root: string): string {
  const list = promoted(root)
  const name = (p: Promoted) => `d${p.number}`
  const text = [
    '// Written by `nest defect-promote` (docs/P2-defect-bank.md, ADR 0009). Do not edit by hand.',
    "import type { BankDefect } from '../defect-bank/types.js'",
    ...list.map((p) => `import ${name(p)} from './${p.id}.js'`),
    '',
    '/** Promoted defects, numbered from 6. The first five live in defects.ts. */',
    'export const PROMOTED: readonly { number: number; defect: BankDefect }[] = [',
    ...list.map((p) => `  { number: ${p.number}, defect: ${name(p)} },`),
    ']',
    '',
  ].join('\n')
  const path = join(root, PROMOTED_DIR, BANK_FILE)
  mkdirSync(join(root, PROMOTED_DIR), { recursive: true })
  writeFileSync(path, text)
  prettierWrite(root, [path])
  return path
}

function gitUser(root: string): string {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** The candidate's header with promotion added, the rest of the file unchanged. */
function restamp(source: string, number: number, by: string, at: string): string {
  const h = readHeader(source)
  const body = source.split(/\r?\n/)
  while (body.length > 0 && body[0]!.startsWith('//')) body.shift()
  const { model = 'unknown', prompt_version = 'unknown', generated_at = null, request = 'unknown', notes } = h
  const head = header(
    { model, prompt_version, generated_at, request },
    {
      status: 'promoted',
      number: String(number),
      promoted_by: by,
      promoted_at: at,
      ...(notes ? { notes } : {}),
    },
  )
  return (
    head +
    body
      .join('\n')
      .replace(/(['"])\.\.\/\.\.\/defect-bank\/types\.js\1/g, "'../defect-bank/types.js'")
      .replace(/(['"])\.\.\/\.\.\/templates\.js\1/g, "'../templates.js'")
      .trimStart()
  )
}

export function promote(
  root: string,
  id: string,
  opts: { by?: string; at?: Date; number?: number } = {},
): { number: number; files: string[] } {
  const from = join(root, CANDIDATES_DIR)
  if (!existsSync(join(from, `${id}.ts`)))
    throw new UsageError(`There is no candidate ${id} in ${CANDIDATES_DIR}.`)
  const check = readChecks(root)[id]
  if (!check || check.result !== 'pass')
    throw new UsageError(
      `${id} has not passed the gate${check ? ` (${check.reason})` : ''}. Run nest defect-check ${id} first.`,
    )
  // nest_data passes the next number counted across both tracks' banks (ADR 0010)
  const number = opts.number ?? Math.max(FIRST_NUMBER - 1, ...promoted(root).map((p) => p.number)) + 1
  const by = opts.by ?? gitUser(root)
  const at = (opts.at ?? new Date()).toISOString()
  const to = join(root, PROMOTED_DIR)
  mkdirSync(to, { recursive: true })
  const files: string[] = []
  for (const name of [`${id}.ts`, `${id}.test.ts`]) {
    if (!existsSync(join(from, name))) continue
    writeFileSync(join(to, name), restamp(readFileSync(join(from, name), 'utf8'), number, by, at))
    rmSync(join(from, name))
    files.push(join(to, name))
  }
  prettierWrite(root, files)
  const checks = readChecks(root)
  delete checks[id]
  writeFileSync(join(from, CHECKS_FILE), JSON.stringify(checks, null, 2) + '\n')
  writeReadme(root)
  files.push(writeBank(root))
  return { number, files }
}
