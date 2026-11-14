// What the Maintainer gate and Maintainer queue scripts read from GitHub to decide a pull
// request's maintainer-gate check (packages/cli/src/gate.ts). Uses gh, with GH_TOKEN.
import { execFileSync } from 'node:child_process'

export const gh = (args, input) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  }).trim()
export const api = (path) => JSON.parse(gh(['api', path]))
export const paged = (path) => JSON.parse(gh(['api', path, '--paginate', '--slurp'])).flat()

/** isMaintainer for gateDecision: admin or maintain permission, each login asked once. */
export function maintainerCheck(repo) {
  const roles = new Map()
  return (login) => {
    if (!roles.has(login)) {
      try {
        roles.set(login, api(`repos/${repo}/collaborators/${login}/permission`).role_name)
      } catch {
        roles.set(login, 'none') // not a collaborator
      }
    }
    return ['admin', 'maintain'].includes(roles.get(login))
  }
}

/** A pull request (as the pulls API gives it; fetched when only its number is given), its files and reviews. */
export function readPullRequest(repo, prOrNumber) {
  const pr = typeof prOrNumber === 'number' ? api(`repos/${repo}/pulls/${prOrNumber}`) : prOrNumber
  const files = paged(`repos/${repo}/pulls/${pr.number}/files?per_page=100`).map((f) => f.filename)
  const reviews = paged(`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`).map((r) => ({
    login: r.user?.login ?? '',
    state: r.state,
    commitId: r.commit_id ?? '',
    submittedAt: r.submitted_at ?? '',
  }))
  return { pr, files, reviews }
}

/** The gate's input for one pull request. */
export const gateInput = ({ pr, files, reviews }, isMaintainer) => ({
  files,
  author: pr.user.login,
  headRef: pr.head.ref,
  headSha: pr.head.sha,
  reviews,
  isMaintainer,
})

/** The pull request's comments that carry a marker, oldest first. */
export const markedComments = (repo, number, marker) =>
  paged(`repos/${repo}/issues/${number}/comments?per_page=100`).filter((c) => c.body?.includes(marker))
