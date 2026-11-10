import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { UsageError } from './args.js'
import type {
  BranchPr,
  BranchPrSpec,
  CollaboratorState,
  Gh,
  IssueSpec,
  MainCommitResult,
  MainCommitSpec,
  PrSpec,
  StageIssue,
} from './gh.js'

type Json = {
  title?: string
  url?: string
  name?: string
  number?: number
  state?: string
  id?: number
  invitee?: { login?: string }
}[]

/** How often a commit to main is tried again when main moved underneath it. */
const MAIN_ATTEMPTS = 5

/** The real thing, through the GitHub CLI and git. */
export class GhCli implements Gh {
  /**
   * `adminToken` is used only for the two invitation calls. The workflow's own token cannot
   * read or send repository invitations ("Resource not accessible by integration"), so the
   * Enrol workflow passes the NEST_ADMIN_TOKEN secret: a token from a repository admin with
   * Administration: write. Everything else keeps the workflow token, so the issues and pull
   * requests are still opened by the bot.
   *
   * `mainToken` is used only for commits straight to main (a cohort's file and its members).
   * A ruleset that requires pull requests cannot list the workflow token as a bypass actor, so
   * the workflows pass a token from the Nest bot GitHub App, which can be on that list
   * (docs/REPO-SETTINGS.md). Empty, the workflow token is used, which works while main allows it.
   */
  constructor(
    private readonly root: string,
    private readonly slug: string,
    private readonly adminToken: string = '',
    private readonly mainToken: string = '',
  ) {}

  static available(): boolean {
    try {
      execFileSync('gh', ['--version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  private gh(args: string[], input?: string, token?: string): string {
    try {
      const opts: ExecFileSyncOptionsWithStringEncoding = {
        cwd: this.root,
        encoding: 'utf8',
        stdio: 'pipe',
        ...(input === undefined ? {} : { input }),
        ...(token ? { env: { ...process.env, GH_TOKEN: token } } : {}),
      }
      return execFileSync('gh', args, opts).trim()
    } catch (e) {
      const err = e as { stderr?: string; message: string }
      throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${(err.stderr ?? err.message).trim()}`)
    }
  }

  private ghJson(args: string[]): Json {
    return JSON.parse(this.gh(args) || '[]') as Json
  }

  private git(args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }

  /**
   * Refuses when tracked files outside `except` have changed, and names them. Untracked files
   * are left out: a pull request only ever stages the paths it is given, so a stray untracked
   * file cannot end up in it, and on the Actions runner it made every scaffold fail.
   */
  private requireCleanTree(except: string[]): void {
    const dirty = this.git([
      'status',
      '--porcelain',
      '--untracked-files=no',
      '--',
      ...except.map((p) => `:!${p}`),
    ])
    if (dirty !== '') {
      const files = dirty
        .split('\n')
        .slice(0, 10)
        // "XY path"; git() trims the output, so the first line may have lost its leading space
        .map((l) => l.trim().replace(/^\S+\s+/, ''))
        .join(', ')
      throw new UsageError(
        `The working tree has uncommitted changes (${files}). Commit or stash them before opening pull requests.`,
      )
    }
  }

  /**
   * Titles of the person's issues: those assigned to them, and the onboarding issues whose
   * title names them. The second set matters because stage issues are created while the
   * invitation is still pending and GitHub drops the assignee, so a re-run that looked only
   * at assignees would open every stage issue a second time.
   */
  listIssueTitles(assignee: string): string[] {
    const list = (filter: string[]) =>
      this.ghJson([
        'issue',
        'list',
        '--repo',
        this.slug,
        ...filter,
        '--state',
        'all',
        '--limit',
        '500',
        '--json',
        'title',
      ]).map((i) => i.title ?? '')
    const mine = `(@${assignee.toLowerCase()})`
    const named = list(['--label', 'onboarding']).filter((t) => t.toLowerCase().endsWith(mine))
    return [...new Set([...list(['--assignee', assignee]), ...named])]
  }

  listPrs(branch: string): BranchPr[] {
    const owner = this.slug.split('/')[0] ?? ''
    const head = encodeURIComponent(`${owner}:${branch}`)
    const prs = JSON.parse(
      this.gh(['api', `repos/${this.slug}/pulls?head=${head}&state=all&per_page=100`]) || '[]',
    ) as {
      number: number
      html_url: string
      state: string
      draft?: boolean
      merged_at?: string | null
      user?: { login?: string } | null
    }[]
    return prs
      .map((p): BranchPr => ({
        number: p.number,
        url: p.html_url,
        author: p.user?.login ?? '',
        state: p.state === 'open' ? 'open' : p.merged_at ? 'merged' : 'closed',
        draft: p.draft === true,
      }))
      .sort((a, b) => b.number - a.number)
  }

  remoteBranchExists(branch: string): boolean {
    return this.git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]) !== ''
  }

  ensureLabel(name: string, color: string, description: string): 'created' | 'exists' {
    const found = this.ghJson([
      'label',
      'list',
      '--repo',
      this.slug,
      '--search',
      name,
      '--limit',
      '100',
      '--json',
      'name',
    ])
    if (found.some((l) => l.name === name)) return 'exists'
    this.gh(['label', 'create', name, '--repo', this.slug, '--color', color, '--description', description])
    return 'created'
  }

  ensureMilestone(title: string): 'created' | 'exists' {
    const found = this.ghJson(['api', `repos/${this.slug}/milestones?state=all&per_page=100`])
    if (found.some((m) => m.title === title)) return 'exists'
    this.gh(['api', '-X', 'POST', `repos/${this.slug}/milestones`, '-f', `title=${title}`])
    return 'created'
  }

  createIssue(spec: IssueSpec): string {
    const args = [
      'issue',
      'create',
      '--repo',
      this.slug,
      '--title',
      spec.title,
      '--body-file',
      '-',
      '--assignee',
      spec.assignee,
    ]
    if (spec.milestone) args.push('--milestone', spec.milestone)
    for (const label of spec.labels) args.push('--label', label)
    try {
      return this.gh(args, spec.body)
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      throw /Resource not accessible by integration/i.test(text) ? explainAppRefusal(text) : e
    }
  }

  createDraftPr(spec: PrSpec): string {
    const original = this.git(['rev-parse', '--abbrev-ref', 'HEAD'])
    // A retry in the same run finds the branch and its commit from the first attempt (the
    // scaffold files left the working tree with that commit), so it reuses them.
    const retrying = this.branchExists(spec.branch)
    if (!retrying) this.requireCleanTree(spec.paths)
    this.git(retrying ? ['checkout', spec.branch] : ['checkout', '-b', spec.branch])
    try {
      if (!retrying) {
        this.git(['add', '--', ...spec.paths])
        this.git(['commit', '-m', `feat: scaffold for @${spec.handle}`])
      }
      // No pull request exists from this branch (the caller checked), so it is the bot's own:
      // a branch an earlier failed run pushed is replaced, not merged into.
      this.git(['push', '--force', '-u', 'origin', spec.branch])
      const args = [
        'pr',
        'create',
        '--repo',
        this.slug,
        '--draft',
        '--head',
        spec.branch,
        '--title',
        spec.title,
        '--body-file',
        '-',
      ]
      if (spec.assignee) args.push('--assignee', spec.assignee)
      return this.gh(args, spec.body)
    } catch (e) {
      throw explainPrRefusal(e)
    } finally {
      this.git(['checkout', original])
    }
  }

  createPrFromBranch(spec: BranchPrSpec): string {
    const args = ['pr', 'create', '--repo', this.slug, '--head', spec.branch, '--title', spec.title]
    if (spec.draft) args.push('--draft')
    if (spec.assignee) args.push('--assignee', spec.assignee)
    try {
      return this.gh([...args, '--body-file', '-'], spec.body)
    } catch (e) {
      throw explainPrRefusal(e)
    }
  }

  closePr(number: number, comment: string): void {
    this.gh(['pr', 'close', String(number), '--repo', this.slug, '--comment', comment])
  }

  private branchExists(branch: string): boolean {
    try {
      this.git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
      return true
    } catch {
      return false
    }
  }

  /** Runs an invitation call with the admin token, explaining a refusal of the workflow token. */
  private asAdmin(args: string[]): string {
    try {
      return this.gh(args, undefined, this.adminToken || undefined)
    } catch (e) {
      const message = (e as Error).message
      if (!/Resource not accessible by integration|HTTP 403/i.test(message)) throw e
      throw new Error(
        this.adminToken
          ? `${message}. The NEST_ADMIN_TOKEN secret must belong to a repository admin and allow Administration: write.`
          : `${message}. The workflow token cannot manage invitations: add a NEST_ADMIN_TOKEN secret (a token from a repository admin with Administration: write).`,
      )
    }
  }

  collaboratorState(handle: string): CollaboratorState {
    try {
      this.gh(['api', `repos/${this.slug}/collaborators/${handle}`])
      return 'collaborator'
    } catch (e) {
      if (!/404|Not Found/i.test((e as Error).message)) throw e
    }
    const invited = JSON.parse(
      this.asAdmin(['api', `repos/${this.slug}/invitations?per_page=100`, '--paginate']) || '[]',
    ) as Json
    return invited.some((i) => i.invitee?.login?.toLowerCase() === handle.toLowerCase()) ? 'invited' : 'none'
  }

  inviteCollaborator(handle: string, permission: 'push'): void {
    this.asAdmin([
      'api',
      '-X',
      'PUT',
      `repos/${this.slug}/collaborators/${handle}`,
      '-f',
      `permission=${permission}`,
    ])
  }

  listStageIssues(handle: string): StageIssue[] {
    const mine = `(@${handle.toLowerCase()})`
    return this.ghJson([
      'issue',
      'list',
      '--repo',
      this.slug,
      '--label',
      'onboarding',
      '--state',
      'all',
      '--limit',
      '500',
      '--json',
      'number,title,state',
    ])
      .filter((i) => (i.title ?? '').toLowerCase().endsWith(mine) && typeof i.number === 'number')
      .map((i): StageIssue => ({
        number: i.number as number,
        title: i.title ?? '',
        state: (i.state ?? '').toUpperCase() === 'OPEN' ? 'open' : 'closed',
      }))
  }

  closeIssueNotPlanned(number: number, comment: string): void {
    this.gh([
      'issue',
      'close',
      String(number),
      '--repo',
      this.slug,
      '--reason',
      'not planned',
      '--comment',
      comment,
    ])
  }

  renameIssue(number: number, title: string): void {
    this.gh(['issue', 'edit', String(number), '--repo', this.slug, '--title', title])
  }

  closeOpenPr(branch: string, comment: string): string | null {
    const open = this.ghJson([
      'pr',
      'list',
      '--repo',
      this.slug,
      '--head',
      branch,
      '--state',
      'open',
      '--limit',
      '1',
      '--json',
      'number,url',
    ])[0]
    if (!open || typeof open.number !== 'number') return null
    this.gh(['pr', 'close', String(open.number), '--repo', this.slug, '--comment', comment])
    return open.url ?? null
  }

  canManageInvitations(): boolean {
    return this.adminToken !== ''
  }

  /**
   * One commit on top of main through the git data API, then a fast-forward-only move of main.
   * Nothing touches the working tree. When main moved in between, GitHub refuses the move and
   * the edit runs again on the newest main, so concurrent changes to one file both land instead
   * of conflicting. A protected main is explained and not retried.
   */
  commitToMain(spec: MainCommitSpec): MainCommitResult {
    const api = (args: string[], body?: unknown) =>
      JSON.parse(
        this.gh(
          ['api', ...args, ...(body === undefined ? [] : ['--input', '-'])],
          body === undefined ? undefined : JSON.stringify(body),
          this.mainToken || undefined,
        ) || '{}',
      ) as Record<string, unknown>
    for (let attempt = 1; attempt <= MAIN_ATTEMPTS; attempt++) {
      const head = (api([`repos/${this.slug}/git/ref/heads/main`]).object as { sha: string }).sha
      const baseTree = (api([`repos/${this.slug}/git/commits/${head}`]).tree as { sha: string }).sha
      const cache = new Map<string, string | null>()
      const read = (path: string): string | null => {
        if (!cache.has(path)) cache.set(path, this.readAt(head, path))
        return cache.get(path) ?? null
      }
      const changed = Object.entries(spec.edit(read)).filter(([path, text]) => read(path) !== text)
      if (changed.length === 0) return { action: 'unchanged', sha: head, paths: [] }
      const tree = api(['-X', 'POST', `repos/${this.slug}/git/trees`], {
        base_tree: baseTree,
        tree: changed.map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
      }).sha as string
      const commit = api(['-X', 'POST', `repos/${this.slug}/git/commits`], {
        message: spec.message,
        tree,
        parents: [head],
      }).sha as string
      try {
        api(['-X', 'PATCH', `repos/${this.slug}/git/refs/heads/main`], { sha: commit, force: false })
        return { action: 'committed', sha: commit, paths: changed.map(([path]) => path) }
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e)
        if (/not a fast.?forward/i.test(text) && attempt < MAIN_ATTEMPTS) continue
        throw explainProtectedMain(e)
      }
    }
    throw new Error(`main kept moving; gave up after ${MAIN_ATTEMPTS} attempts`)
  }

  /** The text of a file on main at a commit, or null when it does not exist there. */
  private readAt(sha: string, path: string): string | null {
    try {
      const file = JSON.parse(
        this.gh([
          'api',
          `repos/${this.slug}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`,
        ]),
      ) as { content?: string; encoding?: string }
      return Buffer.from(file.content ?? '', (file.encoding as BufferEncoding) ?? 'base64').toString('utf8')
    } catch (e) {
      if (/HTTP 404|Not Found/i.test(e instanceof Error ? e.message : String(e))) return null
      throw e
    }
  }

  cancelInvitation(handle: string): 'cancelled' | 'none' {
    const invited = JSON.parse(
      this.asAdmin(['api', `repos/${this.slug}/invitations?per_page=100`, '--paginate']) || '[]',
    ) as Json
    const mine = invited.find((i) => i.invitee?.login?.toLowerCase() === handle.toLowerCase())
    if (!mine || typeof mine.id !== 'number') return 'none'
    this.asAdmin(['api', '-X', 'DELETE', `repos/${this.slug}/invitations/${mine.id}`])
    return 'cancelled'
  }
}

/**
 * GitHub refuses pull requests from the workflow token unless the repository (and, for an
 * organisation, the organisation) allows it, and refuses the Nest bot app's token when the app
 * lacks a permission. Retrying cannot help either, so the error says what to change and is
 * marked as not worth retrying.
 */
export function explainPrRefusal(e: unknown): unknown {
  const text = e instanceof Error ? e.message : String(e)
  if (/Resource not accessible by integration/i.test(text)) return explainAppRefusal(text)
  if (!/not permitted to create or approve pull requests/i.test(text)) return e
  const err = new Error(
    'GitHub Actions is not allowed to open pull requests in this repository. The Enrol workflow opens ' +
      'them with the Nest bot app (NEST_BOT_APP_ID and NEST_BOT_PRIVATE_KEY, docs/REPO-SETTINGS.md), ' +
      'which this setting does not affect; run without the app, turn on "Allow GitHub Actions to create ' +
      'and approve pull requests" in the organisation settings (Actions, General, Workflow permissions) ' +
      'and then in the repository settings.',
  )
  ;(err as Error & { retryable?: boolean }).retryable = false
  return err
}

/** The Nest bot app's token was refused: the app is missing a repository permission. */
export function explainAppRefusal(text: string): Error {
  const err = new Error(
    `${text.split('\n')[0]}. The Nest bot app needs Contents, Pull requests and Issues: Read and write ` +
      "on this repository: add them in the app's settings (Permissions), then accept the new " +
      "permissions on the organisation's installation of the app (docs/REPO-SETTINGS.md).",
  )
  ;(err as Error & { retryable?: boolean }).retryable = false
  return err
}

/**
 * A commit straight to main fails when main is protected against the workflow. That is a
 * setting, so the error names it and is not retried; the step fails instead of falling back to
 * a pull request a maintainer would have to merge.
 */
export function explainProtectedMain(e: unknown): unknown {
  const text = e instanceof Error ? e.message : String(e)
  if (!/protected (branch|ref)|branch protection|repository rule|rule violations?/i.test(text)) return e
  const err = new Error(
    'main is protected against the workflow, so the bot cannot commit cohort files to it. Set up the ' +
      'Nest bot GitHub App (the NEST_BOT_APP_ID variable and NEST_BOT_PRIVATE_KEY secret) and add it to ' +
      "the bypass list of main's ruleset (docs/REPO-SETTINGS.md). The workflow token itself cannot be " +
      'on that list. GitHub said: ' +
      text,
  )
  ;(err as Error & { retryable?: boolean }).retryable = false
  return err
}
