export type IssueSpec = {
  title: string
  body: string
  labels: string[]
  assignee: string
  milestone?: string | undefined
}
export type PrSpec = {
  handle: string
  branch: string
  title: string
  body: string
  paths: string[]
  assignee?: string | undefined
}
/**
 * A commit straight to main by the bot. `edit` gets the text of a path on main (null when the
 * path does not exist there) and returns the files to write. It runs again against the newest
 * main whenever main moved in between, so two enrolments into one cohort both land.
 */
export type MainCommitSpec = {
  message: string
  edit: (read: (path: string) => string | null) => Record<string, string>
}
export type MainCommitResult = { action: 'committed' | 'unchanged'; sha: string | null; paths: string[] }
export type CollaboratorState = 'collaborator' | 'invited' | 'none'
/** A personal stage issue: labelled onboarding, its title ending "(@handle)". */
export type StageIssue = { number: number; title: string; state: 'open' | 'closed' }

/** Everything enroll, open-cohort, new-task and withdraw need from GitHub. Synchronous on purpose: it is a CLI. */
export interface Gh {
  /** Titles of every issue, open or closed, assigned to the handle. */
  listIssueTitles(assignee: string): string[]
  /** URL of a pull request from the branch, open or closed, or null. */
  findPr(branch: string): string | null
  ensureLabel(name: string, color: string, description: string): 'created' | 'exists'
  ensureMilestone(title: string): 'created' | 'exists'
  /** Returns the issue URL. */
  createIssue(spec: IssueSpec): string
  /** Commits the paths on a new branch, pushes it, opens a draft PR and returns to the original branch. */
  createDraftPr(spec: PrSpec): string
  /** Commits the edited files to main as the bot, with no pull request; see MainCommitSpec. */
  commitToMain(spec: MainCommitSpec): MainCommitResult
  collaboratorState(handle: string): CollaboratorState
  inviteCollaborator(handle: string, permission: 'push'): void
  /** Onboarding issues, open or closed, whose title ends "(@handle)", case-insensitive. */
  listStageIssues(handle: string): StageIssue[]
  /** Closes an issue as not planned with one comment. */
  closeIssueNotPlanned(number: number, comment: string): void
  renameIssue(number: number, title: string): void
  /** Closes the open pull request from the branch and returns its URL, or null when none is open. */
  closeOpenPr(branch: string, comment: string): string | null
  /** Whether invitations can be read and cancelled (they need the admin token). */
  canManageInvitations(): boolean
  /** Cancels a pending invitation for the handle; 'none' when there is none. */
  cancelInvitation(handle: string): 'cancelled' | 'none'
}

export const LABEL_COLORS: Record<string, string> = {
  onboarding: '0E5450',
  stage: '569289',
  cohort: '9FD9CF',
  track: '3B6EA8',
  maintainers: 'B3401E',
}

/** The login GitHub gives pull requests and issues created with the workflow token. */
export const BOT_LOGIN = 'github-actions[bot]'
