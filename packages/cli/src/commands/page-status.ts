import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { COHORTS_DIR, CONTRIBUTORS_DIR, formatIssue, pageStatus, type PageStatus } from '@nest/schema'
import { UsageError } from '../args.js'
import type { Io } from '../io.js'
import type { RepoConfig } from '../root.js'

export type PageStatusOptions = {
  handle: string
  /** A git ref to read. Default: origin/main after a fetch, or main when there is no remote. */
  ref?: string | undefined
  /** Read the working tree instead of a git ref. */
  local?: boolean | undefined
  /** Fetch origin main first when no ref is given. Default true; tests turn it off. */
  fetch?: boolean | undefined
}

function git(root: string, args: string[], input?: string) {
  return spawnSync('git', args, { cwd: root, input, maxBuffer: 256 * 1024 * 1024 })
}

const ok = (r: ReturnType<typeof git>) => r.status === 0

/** Writes every file under contributors/ and cohorts/ at the ref into dest, reading them in one git call. */
export function materialize(root: string, ref: string, dest: string): void {
  const list = git(root, ['ls-tree', '-r', '-z', '--name-only', ref, '--', CONTRIBUTORS_DIR, COHORTS_DIR])
  if (!ok(list)) throw new UsageError(`git could not list ${ref}: ${list.stderr.toString().trim()}`)
  const paths = list.stdout.toString('utf8').split('\0').filter(Boolean)
  mkdirSync(join(dest, CONTRIBUTORS_DIR), { recursive: true })
  if (paths.length === 0) return
  const batch = git(root, ['cat-file', '--batch'], paths.map((p) => `${ref}:${p}\n`).join(''))
  if (!ok(batch)) throw new UsageError(`git could not read ${ref}: ${batch.stderr.toString().trim()}`)
  const out = batch.stdout
  let at = 0
  for (const path of paths) {
    const eol = out.indexOf(0x0a, at)
    const header = out.subarray(at, eol).toString('utf8').split(' ')
    at = eol + 1
    if (header[1] !== 'blob') continue
    const size = Number(header[2])
    const target = join(dest, ...path.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, out.subarray(at, at + size))
    at += size + 1
  }
}

function resolveRef(config: RepoConfig, opts: PageStatusOptions, io: Io): { ref: string; label: string } {
  let ref = opts.ref
  if (ref === undefined) {
    if (opts.fetch !== false) {
      const f = git(config.root, ['fetch', '--quiet', 'origin', 'main'])
      if (!ok(f)) io.err('Could not fetch origin main, so this shows what this clone last saw of main.')
    }
    const hasRemote = ok(git(config.root, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']))
    ref = hasRemote ? 'origin/main' : 'main'
  }
  const log = git(config.root, ['log', '-1', '--format=%h, %cs', ref, '--'])
  if (!ok(log)) throw new UsageError(`"${ref}" is not a git ref in ${config.root}.`)
  return { ref, label: `${ref} (commit ${log.stdout.toString().trim()})` }
}

const yesNo = (v: boolean) => (v ? 'yes' : 'no')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Sentences for why the page would not appear, most fundamental first. */
export function blockers(s: PageStatus, where: string): string[] {
  if (!s.exists)
    return [
      `${s.profileFile} is not on ${where}. The scaffold pull request for @${s.handle} has to be merged first.`,
    ]
  const why: string[] = []
  if (s.isTemplate) why.push('Directories that start with _ are templates. They never publish.')
  if (s.ownIssues.length > 0)
    why.push('The files in this directory do not validate. Fix the problems listed above in a pull request.')
  if (s.visibility !== 'public')
    why.push(`visibility.page is ${s.visibility ?? 'missing'}. Set it to public in a pull request.`)
  if (s.otherIssues.length > 0)
    why.push(
      `${plural(s.otherIssues.length, 'problem')} in other files stop the whole site from building, so no page changes until they are fixed.`,
    )
  return why
}

/** Prints what the site would build for one contributor. Exit code 0 when the page would appear, 1 when not. */
export function runPageStatus(config: RepoConfig, opts: PageStatusOptions, io: Io): number {
  let source = config.root
  let label = 'the working tree'
  let where = 'the working tree'
  let temp: string | undefined
  try {
    if (!opts.local) {
      const r = resolveRef(config, opts, io)
      label = r.label
      where = r.ref
      temp = mkdtempSync(join(tmpdir(), 'nest-page-status-'))
      materialize(config.root, r.ref, temp)
      source = temp
    }
    const s = pageStatus(source, opts.handle, config.siteUrl)
    io.out(`Page status for @${s.handle} on ${label}`)
    io.out('')
    io.out(`profile.yml       ${s.exists ? 'exists' : 'not found'}: ${s.profileFile}`)
    io.out(`visibility.page   ${s.exists ? (s.visibility ?? 'missing') : '-'}`)
    if (s.ownIssues.length === 0) io.out(`validates         ${s.exists ? 'yes' : '-'}`)
    else {
      io.out(`validates         no, ${plural(s.ownIssues.length, 'problem')}:`)
      for (const i of s.ownIssues) io.out(`                    ${formatIssue(i)}`)
    }
    if (s.builds) io.out('site builds       yes')
    else {
      const total = s.ownIssues.length + s.otherIssues.length
      io.out(`site builds       no, ${plural(total, 'problem')} in the repository`)
      for (const i of s.otherIssues) io.out(`                    ${formatIssue(i)}`)
    }
    io.out(`page              ${yesNo(s.page)}`)
    io.out(`feed entry        ${yesNo(s.feed)} (the landing site and the page count read it)`)
    io.out(`cohort page       ${s.cohortPage ? `yes, /cohorts/${s.cohortPage}/` : 'no'}`)
    const home = s.homeRecent
      ? 'yes, among the most active pages shown'
      : s.feed
        ? 'counted, not among the most active pages shown'
        : 'no'
    io.out(`home page         ${home}`)
    io.out(`url               ${s.url}`)
    io.out('')
    if (s.page) {
      io.out('The page is live a few minutes after this commit reaches main.')
      return 0
    }
    io.out('Why it would not appear:')
    for (const line of blockers(s, where)) io.out(`  - ${line}`)
    return 1
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true })
  }
}
