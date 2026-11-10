import { ALLOWED_CONTRIBUTOR_FILE, CONTRIBUTORS_DIR, explainHandle, PRACTICE_FILE } from '@nest/schema'
import { BOT_LOGIN, NEST_BOT_LOGIN } from './gh.js'

export type OwnDirectoryCheck = { ok: true; handle: string } | { ok: false; reason: string }

/** Files the enrolment bot may change on its own: a cohort's member list and the owners file. */
const BOT_FILE = /^(cohorts\/\d{4}-\d{2}\/cohort\.yml|\.github\/CODEOWNERS)$/

const normalize = (file: string) => file.split(String.fromCharCode(92)).join('/')

/**
 * Decides whether a pull request may merge on its own. Three cases:
 * 1. Every changed file sits in the author's own contributor directory, is a file that belongs
 *    there, and is not the workflow-owned counts file.
 * 2. The author is the Nest bot app (`botLogin`) and the pull request is a scaffold, from
 *    `scaffold/<handle>` (`headRef`): the same rule, for that handle's directory. The member
 *    finishes it in Stage 2 and marks it ready, and it merges like their own pull requests.
 * 3. The author is the workflow bot and every changed file is a cohort member list or CODEOWNERS,
 *    which is what nest enroll changed before it committed those to main.
 * Used by the auto-merge workflow on the base branch, never on the pull request's own code.
 */
export function checkOwnDirectoryChange(
  files: readonly string[],
  author: string,
  headRef = '',
  botLogin = NEST_BOT_LOGIN,
): OwnDirectoryCheck {
  if (files.length === 0) return { ok: false, reason: 'The pull request changes no files.' }
  if (botLogin !== '' && author.toLowerCase() === botLogin.toLowerCase()) {
    const scaffold = /^scaffold\/([^/]+)$/.exec(headRef)
    if (!scaffold)
      return {
        ok: false,
        reason: `${author} merges on its own only from a scaffold/<handle> branch, not ${headRef || 'an unnamed branch'}.`,
      }
    const handle = scaffold[1]!.toLowerCase()
    const why = explainHandle(handle)
    if (why) return { ok: false, reason: `The scaffold branch's handle ${why}` }
    return checkDirectory(files, handle)
  }
  if (author === BOT_LOGIN) {
    const outside = files.map(normalize).find((f) => !BOT_FILE.test(f))
    if (outside)
      return { ok: false, reason: `${outside} is not a file the enrolment bot may change on its own.` }
    return { ok: true, handle: BOT_LOGIN }
  }
  const handle = author.toLowerCase()
  const why = explainHandle(handle)
  if (why) return { ok: false, reason: `The author's login ${why}` }
  return checkDirectory(files, handle)
}

/** Every file is in contributors/<handle>/, belongs there, and is not the workflow-owned counts file. */
function checkDirectory(files: readonly string[], handle: string): OwnDirectoryCheck {
  const prefix = `${CONTRIBUTORS_DIR}/${handle}/`
  for (const file of files) {
    const normalized = normalize(file)
    if (!normalized.startsWith(prefix)) {
      return {
        ok: false,
        reason: `${normalized} is outside ${prefix}, so a maintainer reviews this pull request.`,
      }
    }
    const name = normalized.slice(prefix.length)
    if (name.includes('/'))
      return {
        ok: false,
        reason: `${normalized} is in a subdirectory, which a contributor directory does not have.`,
      }
    if (name === PRACTICE_FILE)
      return {
        ok: false,
        reason: `${normalized} is written by a workflow and is not edited in pull requests.`,
      }
    if (!ALLOWED_CONTRIBUTOR_FILE.test(name))
      return { ok: false, reason: `${normalized} is not a file that belongs in a contributor directory.` }
  }
  return { ok: true, handle }
}
