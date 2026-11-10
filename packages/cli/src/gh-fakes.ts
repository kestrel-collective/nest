import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UsageError } from './args.js'
import { NEST_BOT_LOGIN, type BranchPr, type BranchPrSpec } from './gh.js'
import type {
  CollaboratorState,
  Gh,
  IssueSpec,
  MainCommitResult,
  MainCommitSpec,
  PrSpec,
  StageIssue,
} from './gh.js'

type Method = keyof Gh

/** In-memory GitHub for tests. Reads answer from what was seeded or created. */
export class FakeGh implements Gh {
  issues: IssueSpec[] = []
  prs: PrSpec[] = []
  labels = new Set<string>()
  milestones = new Set<string>()
  collaborators = new Set<string>()
  invitations = new Set<string>()
  /** Issue numbers (1-based positions in `issues`) that are closed, and the comments left on issues. */
  closedIssues = new Set<number>()
  comments = new Map<number, string[]>()
  /** Branches whose pull request has been closed. */
  closedBranches = new Set<string>()
  /** Every pull request with its branch, newest last, as listPrs reports them; and the branches on the remote. */
  pullRequests: { branch: string; pr: BranchPr }[] = []
  remoteBranches = new Set<string>()
  /** The account the fake's writes are made as: the Nest bot app, as in the Enrol workflow. */
  login = NEST_BOT_LOGIN
  /** Whether the admin token is present, so invitations can be read and cancelled. */
  adminToken = true
  /** Files on main, and every commit the bot made to it. */
  main = new Map<string, string>()
  commits: { message: string; files: Record<string, string> }[] = []
  /** When set, someone else commits these files to main just before the bot's next commit lands. */
  raceOnNextCommit: Record<string, string> | null = null
  /** When true, main refuses the bot's commits as a protected branch would. */
  protectedMain = false
  /** Comments left when closing pull requests, by number. */
  prComments = new Map<number, string[]>()
  calls: string[] = []
  private counter = 0
  private failures = new Map<Method, number>()

  /** A checkout whose files main starts from, when the test has one. */
  private readonly root: string | undefined

  constructor(
    seed: {
      issueTitles?: Record<string, string[]>
      prBranches?: string[]
      /** Pull requests opened earlier; author defaults to the workflow bot, state to open. */
      pullRequests?: {
        branch: string
        author?: string
        state?: BranchPr['state']
        draft?: boolean
        onRemote?: boolean
      }[]
      collaborators?: string[]
      invited?: string[]
      root?: string
    } = {},
  ) {
    this.root = seed.root
    for (const [assignee, titles] of Object.entries(seed.issueTitles ?? {})) {
      for (const title of titles) this.issues.push({ title, body: '', labels: [], assignee })
    }
    for (const branch of seed.prBranches ?? []) this.addPr(branch, 'github-actions[bot]', 'open', true)
    for (const p of seed.pullRequests ?? []) {
      this.addPr(p.branch, p.author ?? 'github-actions[bot]', p.state ?? 'open', p.draft ?? true)
      if (p.onRemote === false) this.remoteBranches.delete(p.branch)
    }
    for (const c of seed.collaborators ?? []) this.collaborators.add(c.toLowerCase())
    for (const i of seed.invited ?? []) this.invitations.add(i.toLowerCase())
  }

  private addPr(branch: string, author: string, state: BranchPr['state'], draft: boolean): string {
    const number = 100 + this.pullRequests.length
    const url = `https://example.test/pull/${number}`
    this.pullRequests.push({ branch, pr: { number, url, author, state, draft } })
    this.prs.push({ handle: '', branch, title: '', body: '', paths: [] })
    this.remoteBranches.add(branch)
    return url
  }

  /** Make the next n calls of a method throw, then succeed. */
  failNext(method: Method, times: number): void {
    this.failures.set(method, times)
  }

  private record(method: Method, detail: string): void {
    this.calls.push(`${method} ${detail}`.trim())
    const left = this.failures.get(method) ?? 0
    if (left > 0) {
      this.failures.set(method, left - 1)
      throw new Error(`fake ${method} failure (${left} left)`)
    }
  }

  listIssueTitles(assignee: string): string[] {
    this.record('listIssueTitles', assignee)
    return this.issues.filter((i) => i.assignee.toLowerCase() === assignee.toLowerCase()).map((i) => i.title)
  }

  listPrs(branch: string): BranchPr[] {
    this.record('listPrs', branch)
    return this.pullRequests
      .filter((p) => p.branch === branch)
      .map((p) => ({ ...p.pr }))
      .reverse()
  }

  remoteBranchExists(branch: string): boolean {
    this.record('remoteBranchExists', branch)
    return this.remoteBranches.has(branch)
  }

  ensureLabel(name: string): 'created' | 'exists' {
    this.record('ensureLabel', name)
    if (this.labels.has(name)) return 'exists'
    this.labels.add(name)
    return 'created'
  }

  ensureMilestone(title: string): 'created' | 'exists' {
    this.record('ensureMilestone', title)
    if (this.milestones.has(title)) return 'exists'
    this.milestones.add(title)
    return 'created'
  }

  createIssue(spec: IssueSpec): string {
    this.record('createIssue', spec.title)
    this.issues.push(spec)
    return `https://example.test/issues/${++this.counter}`
  }

  createDraftPr(spec: PrSpec): string {
    this.record('createDraftPr', spec.branch)
    const url = this.addPr(spec.branch, this.login, 'open', true)
    this.prs[this.prs.length - 1] = spec
    return url
  }

  createPrFromBranch(spec: BranchPrSpec): string {
    this.record('createPrFromBranch', spec.branch)
    if (!this.remoteBranches.has(spec.branch)) throw new Error(`fake: no branch ${spec.branch} on the remote`)
    if (this.pullRequests.some((p) => p.branch === spec.branch && p.pr.state === 'open'))
      throw new Error(`fake: a pull request for branch "${spec.branch}" already exists`)
    const url = this.addPr(spec.branch, this.login, 'open', spec.draft)
    this.prs[this.prs.length - 1] = {
      handle: '',
      branch: spec.branch,
      title: spec.title,
      body: spec.body,
      paths: [],
      assignee: spec.assignee,
    }
    return url
  }

  closePr(number: number, comment: string): void {
    this.record('closePr', String(number))
    const found = this.pullRequests.find((p) => p.pr.number === number)
    if (!found || found.pr.state !== 'open') throw new Error(`fake: no open pull request #${number}`)
    found.pr.state = 'closed'
    this.prComments.set(number, [...(this.prComments.get(number) ?? []), comment])
  }

  commitToMain(spec: MainCommitSpec): MainCommitResult {
    this.record('commitToMain', spec.message)
    for (let attempt = 1; attempt <= 5; attempt++) {
      const read = (path: string) => this.main.get(path) ?? this.fromRoot(path)
      const changed = Object.entries(spec.edit(read)).filter(([path, text]) => read(path) !== text)
      if (changed.length === 0) return { action: 'unchanged', sha: null, paths: [] }
      if (this.protectedMain) {
        const err = new Error('main is protected against the workflow (fake protected branch).')
        ;(err as Error & { retryable?: boolean }).retryable = false
        throw err
      }
      if (this.raceOnNextCommit) {
        for (const [path, text] of Object.entries(this.raceOnNextCommit)) this.main.set(path, text)
        this.raceOnNextCommit = null
        continue // main moved: the edit runs again on the newer main
      }
      for (const [path, text] of changed) this.main.set(path, text)
      this.commits.push({ message: spec.message, files: Object.fromEntries(changed) })
      return { action: 'committed', sha: `fake-${this.commits.length}`, paths: changed.map(([path]) => path) }
    }
    throw new Error('main kept moving')
  }

  private fromRoot(path: string): string | null {
    if (!this.root) return null
    const file = join(this.root, path)
    return existsSync(file) ? readFileSync(file, 'utf8') : null
  }

  collaboratorState(handle: string): CollaboratorState {
    this.record('collaboratorState', handle)
    const h = handle.toLowerCase()
    return this.collaborators.has(h) ? 'collaborator' : this.invitations.has(h) ? 'invited' : 'none'
  }

  inviteCollaborator(handle: string): void {
    this.record('inviteCollaborator', handle)
    this.invitations.add(handle.toLowerCase())
  }

  listStageIssues(handle: string): StageIssue[] {
    this.record('listStageIssues', handle)
    const mine = `(@${handle.toLowerCase()})`
    return this.issues.flatMap((issue, i): StageIssue[] =>
      issue.labels.includes('onboarding') && issue.title.toLowerCase().endsWith(mine)
        ? [{ number: i + 1, title: issue.title, state: this.closedIssues.has(i + 1) ? 'closed' : 'open' }]
        : [],
    )
  }

  closeIssueNotPlanned(number: number, comment: string): void {
    this.record('closeIssueNotPlanned', String(number))
    this.closedIssues.add(number)
    this.comments.set(number, [...(this.comments.get(number) ?? []), comment])
  }

  renameIssue(number: number, title: string): void {
    this.record('renameIssue', `${number} ${title}`)
    const issue = this.issues[number - 1]
    if (issue) issue.title = title
  }

  closeOpenPr(branch: string): string | null {
    this.record('closeOpenPr', branch)
    const open = this.pullRequests.find((p) => p.branch === branch && p.pr.state === 'open')
    if (!open || this.closedBranches.has(branch)) return null
    this.closedBranches.add(branch)
    open.pr.state = 'closed'
    return open.pr.url
  }

  canManageInvitations(): boolean {
    return this.adminToken
  }

  cancelInvitation(handle: string): 'cancelled' | 'none' {
    this.record('cancelInvitation', handle)
    return this.invitations.delete(handle.toLowerCase()) ? 'cancelled' : 'none'
  }
}

const NOT_INSTALLED = 'gh is not installed, so nothing can be created. Install GitHub CLI or drop --gh.'

/** Answers every read with "nothing exists" and refuses writes. Used for dry runs and print mode. */
export class NullGh implements Gh {
  listIssueTitles(): string[] {
    return []
  }
  listPrs(): BranchPr[] {
    return []
  }
  remoteBranchExists(): boolean {
    return false
  }
  ensureLabel(): 'created' {
    return 'created'
  }
  ensureMilestone(): 'created' {
    return 'created'
  }
  createIssue(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  createDraftPr(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  createPrFromBranch(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  closePr(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  commitToMain(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  collaboratorState(): CollaboratorState {
    return 'none'
  }
  inviteCollaborator(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  listStageIssues(): StageIssue[] {
    return []
  }
  closeIssueNotPlanned(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  renameIssue(): never {
    throw new UsageError(NOT_INSTALLED)
  }
  closeOpenPr(): null {
    return null
  }
  canManageInvitations(): boolean {
    return false
  }
  cancelInvitation(): never {
    throw new UsageError(NOT_INSTALLED)
  }
}
