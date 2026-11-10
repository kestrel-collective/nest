import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { COHORT_FILE, COHORTS_DIR, CONTRIBUTORS_DIR, PERSONAL_STAGES, type Track } from '@nest/schema'
import { addCodeownersLine, addCohortMember } from '../enroll-files.js'
import { fillTemplate, NO_COHORT, renderIssue, templateVars } from '../issue-body.js'
import { planScaffold, scaffold } from './scaffold.js'
import {
  enrollCommitMessage,
  readRepoFile,
  scaffoldBranch,
  scaffoldPrTitle,
  type EnrollContext,
} from './enroll.js'
import { ensureIssueLabels } from './new-task.js'
import type { BranchPr } from '../gh.js'

const CODEOWNERS = '.github/CODEOWNERS'
const SCAFFOLD_TEMPLATE = '.github/PR_TEMPLATE_SCAFFOLD.md'

/** The cohort file and CODEOWNERS with the handle added; only the files that change. */
function cohortEdits(
  read: (path: string) => string | null,
  cohortPath: string,
  handle: string,
  track: Track,
): Record<string, string> {
  const files: Record<string, string> = {}
  const members = addCohortMember(read(cohortPath) ?? '', handle, track)
  const owners = addCodeownersLine(read(CODEOWNERS) ?? '', handle)
  if (members.changed) files[cohortPath] = members.text
  if (owners.changed) files[CODEOWNERS] = owners.text
  return files
}

/**
 * a. The handle is in the cohort member list and owns its directory in CODEOWNERS, committed
 * straight to main by the bot: no pull request, so no maintainer has to merge anything. The
 * edit is made against the newest main, so two people enrolled at once both land.
 */
export function stepCohortFiles(ctx: EnrollContext): void {
  const { config, opts, gh, io, report } = ctx
  const { handle, cohort, mode, track } = opts
  if (cohort === NO_COHORT) return ctx.done('a', 'skipped', 'no cohort')
  const cohortPath = `${COHORTS_DIR}/${cohort}/${COHORT_FILE}`
  const local = cohortEdits((p) => readRepoFile(config.root, p), cohortPath, handle, track)
  if (Object.keys(local).length === 0) return ctx.done('a', 'skipped', 'already a member and owner')
  const message = enrollCommitMessage(handle, cohort)
  const changed = Object.keys(local).join(', ')
  if (mode === 'print') {
    io.out(`# ${message}`)
    io.out(`Commits ${changed} to main as the bot, with no pull request.`)
    io.out('')
    return ctx.done('a', 'would create', `commit on main changing ${changed}`)
  }
  if (mode === 'dry-run')
    return ctx.done('a', 'would create', `commit "${message}" on main changing ${changed}`)
  const result = ctx.retry('cohort files', () =>
    gh.commitToMain({ message, edit: (read) => cohortEdits(read, cohortPath, handle, track) }),
  )
  report.cohortCommit = result.sha
  if (result.action === 'unchanged') return ctx.done('a', 'skipped', 'already a member and owner on main')
  ctx.done(
    'a',
    result.paths.includes(cohortPath) ? 'created' : 'updated',
    `${result.paths.join(', ')} committed to main (${result.sha ?? ''})`,
  )
}

export type ScaffoldPrPlan =
  { action: 'keep' | 'leave' | 'replace' | 'reopen'; pr: BranchPr } | { action: 'scaffold' }

/**
 * What step b does with the pull requests already opened from scaffold/<handle> (newest first).
 * `botLogin` is the Nest bot app's login, the account the scaffold pull request should be from:
 * one opened by any other account (the workflow token, whose pull requests never run the
 * required checks) is replaced by one from the app. The branch is never pushed to then: in
 * Stage 2 the member commits to it, and that work stays. Without a bot login nothing is replaced.
 *
 * - keep: open, and from the app (or no bot login is known)
 * - replace: open, from another account; close it, then open one from the same branch
 * - reopen: closed unmerged, from another account, branch still there; open one from it. This
 *   also finishes a replace whose close went through but whose new pull request did not.
 * - leave: merged, or closed by the app or with no bot login; nothing is opened again
 * - scaffold: none; scaffold the directory and open a draft
 */
export function planScaffoldPr(
  prs: readonly BranchPr[],
  botLogin: string,
  branchOnRemote: () => boolean,
): ScaffoldPrPlan {
  const isBot = (pr: BranchPr) => botLogin === '' || pr.author.toLowerCase() === botLogin.toLowerCase()
  const open = prs.find((p) => p.state === 'open')
  if (open) return { action: isBot(open) ? 'keep' : 'replace', pr: open }
  const latest = prs[0]
  if (!latest) return { action: 'scaffold' }
  if (latest.state === 'closed' && !isBot(latest) && branchOnRemote()) return { action: 'reopen', pr: latest }
  if (latest.state === 'closed' && !isBot(latest)) return { action: 'scaffold' }
  return { action: 'leave', pr: latest }
}

/** b. The contributor directory exists on main or on a scaffold branch, otherwise a draft PR creates it. */
export function stepScaffold(ctx: EnrollContext): void {
  const { config, opts, gh, io, report } = ctx
  const { handle, cohort, mode, track } = opts
  if (existsSync(join(config.root, CONTRIBUTORS_DIR, handle)))
    return ctx.done('b', 'skipped', `contributors/${handle}/ exists on main`)
  const branch = scaffoldBranch(handle)
  const title = scaffoldPrTitle(handle)
  const template =
    readRepoFile(config.root, SCAFFOLD_TEMPLATE) || 'Starter directory for @{{handle}}{{cohort_phrase}}.\n'
  const body = fillTemplate(template, templateVars(config, { handle, name: opts.name, cohort }))
  if (mode !== 'apply') {
    const planned =
      track === 'python'
        ? opts.pythonScaffold(config, { handle, cohort, today: opts.today, plan: true }).defect
        : (planScaffold(config, { handle, cohort, today: opts.today }).defect?.id ?? null)
    if (mode === 'print') {
      io.out(`# ${title}`)
      io.out(body.trimEnd())
      io.out('')
    }
    const detail = `draft PR "${title}" from ${branch} assigned to ${handle}, ${track} track, planted defect ${planned ?? 'none'}; open branches not checked without --gh`
    return ctx.done('b', 'would create', detail)
  }
  const prs = ctx.retry('scaffold branch lookup', () => gh.listPrs(branch))
  const plan = planScaffoldPr(prs, opts.botLogin ?? '', () =>
    ctx.retry('scaffold branch on the remote', () => gh.remoteBranchExists(branch)),
  )
  if (plan.action === 'keep') return ctx.done('b', 'skipped', `${plan.pr.url} is already open from ${branch}`)
  if (plan.action === 'leave')
    return ctx.done('b', 'skipped', `${plan.pr.url} from ${branch} was ${plan.pr.state}; not opened again`)
  if (plan.action === 'replace' || plan.action === 'reopen') {
    const old = plan.pr
    if (plan.action === 'replace')
      ctx.retry('closing the old scaffold pull request', () =>
        gh.closePr(
          old.number,
          `Replaced by a pull request from ${opts.botLogin} on the same branch, so the required checks run on it. ` +
            'Every commit on the branch is kept.',
        ),
      )
    const url = ctx.retry('scaffold pull request', () =>
      gh.createPrFromBranch({ branch, title, body, assignee: handle, draft: old.draft }),
    )
    report.scaffolded = true
    return ctx.done(
      'b',
      plan.action === 'replace' ? 'updated' : 'created',
      `${url} from ${branch}, replacing ${old.url} (${old.state}, opened by ${old.author}); its commits kept`,
    )
  }
  // ADR 0010: the python track's scaffold comes from nest_data, the js track's from here
  const planted =
    track === 'python'
      ? opts.pythonScaffold(config, { handle, cohort, today: opts.today, plan: false }).defect
      : (scaffold(config, { handle, cohort, today: opts.today }).defect?.id ?? null)
  const url = ctx.retry('scaffold pull request', () =>
    gh.createDraftPr({
      handle,
      branch,
      title,
      body,
      paths: [`${CONTRIBUTORS_DIR}/${handle}`],
      assignee: handle,
    }),
  )
  report.scaffolded = true
  ctx.done('b', 'created', `${url} (${track} track, planted defect ${planted ?? 'none'})`)
}

/** c. The handle is a collaborator with push permission, or has an invitation waiting. */
export function stepInvite(ctx: EnrollContext): void {
  const { opts, gh, report } = ctx
  const { handle, mode } = opts
  if (mode !== 'apply') {
    report.invitation = 'not checked'
    return ctx.done(
      'c',
      'would create',
      'invitation with push permission; current state is not checked without --gh',
    )
  }
  const state = ctx.retry('collaborator lookup', () => gh.collaboratorState(handle))
  if (state === 'collaborator') {
    report.invitation = 'collaborator'
    return ctx.done('c', 'skipped', 'already a collaborator')
  }
  if (state === 'invited') {
    report.invitation = 'invited'
    return ctx.done('c', 'skipped', 'invitation already pending')
  }
  ctx.retry('collaborator invitation', () => gh.inviteCollaborator(handle, 'push'))
  report.invitation = 'invited'
  ctx.done('c', 'created', 'invited with push permission')
}

/** "3 @handle" for a personal stage issue's title ("Stage 3: … (@handle)"), or null for any other title. */
export function stageIssueKey(title: string): string | null {
  const m = /^stage (\d+):.*\(@([^)\s]+)\)$/i.exec(title.trim())
  return m ? `${m[1]} @${m[2]!.toLowerCase()}` : null
}

/**
 * Whether a stage issue is already among the person's issue titles, open or closed: the same title,
 * or the same stage for the same handle under an older title, so a stage renamed in stages/ never
 * gets a second issue. An existing issue is kept as it is; enrolment never opens another.
 */
export function existingStageIssue(titles: readonly string[]): (title: string) => boolean {
  const lower = new Set(titles.map((t) => t.toLowerCase()))
  const keys = new Set(titles.map(stageIssueKey).filter((k) => k !== null))
  return (title) => {
    const key = stageIssueKey(title)
    return lower.has(title.toLowerCase()) || (key !== null && keys.has(key))
  }
}

/** d. One personal issue per stage 1, 2, 3, 4, 6 and 7, skipping any title that already exists. */
export function stepIssues(ctx: EnrollContext): void {
  const { config, opts, gh, io, report } = ctx
  const { handle, cohort, mode, track } = opts
  const issues = PERSONAL_STAGES.map((n) =>
    renderIssue(config, n, { handle, name: opts.name, cohort, track }),
  )
  const milestone = cohort === NO_COHORT ? 'none' : cohort
  if (mode !== 'apply') {
    for (const issue of issues) {
      if (mode === 'print') {
        io.out(`## ${issue.title}`)
        io.out(`Labels: ${issue.labels.join(', ')}. Assignee: ${handle}. Milestone: ${milestone}.`)
        io.out('')
        io.out(issue.body.trimEnd())
        io.out('')
      } else
        io.out(
          `Would create "${issue.title}" with labels ${issue.labels.join(', ')}, assignee ${handle}, milestone ${milestone}.`,
        )
      report.issuesCreated.push(issue.title)
    }
    return ctx.done('d', 'would create', `${issues.length} issues, milestone ${milestone}`)
  }
  const titles = ctx.retry('issue lookup', () => gh.listIssueTitles(handle))
  const exists = existingStageIssue(titles)
  if (cohort !== NO_COHORT && ctx.retry('milestone', () => gh.ensureMilestone(cohort)) === 'created')
    io.out(`Created milestone ${cohort}`)
  for (const issue of issues) {
    if (exists(issue.title)) {
      report.issuesSkipped.push(issue.title)
      continue
    }
    const url = ctx.retry(`issue "${issue.title}"`, () => {
      ensureIssueLabels(gh, issue, io)
      return gh.createIssue({
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        assignee: handle,
        milestone: issue.milestone,
      })
    })
    io.out(`Created ${url} "${issue.title}"`)
    report.issuesCreated.push(issue.title)
  }
  const outcome = report.issuesCreated.length > 0 ? 'created' : 'skipped'
  ctx.done(
    'd',
    outcome,
    `${report.issuesCreated.length} created, ${report.issuesSkipped.length} already existed`,
  )
}
