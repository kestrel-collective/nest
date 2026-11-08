import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPublishable } from './contributor.js'
import { pageUrl } from './feed.js'
import { CONTRIBUTORS_DIR, PROFILE_FILE, rel } from './files.js'
import type { ValidationIssue } from './issues.js'
import { validateRepo } from './repo.js'
import { byActivity, HOME_RECENT, publishedContributors } from './site.js'
import { readYaml } from './yaml.js'

export type PageStatus = {
  handle: string
  profileFile: string
  exists: boolean
  /** visibility.page as written in the file, even when the file does not validate. */
  visibility: string | undefined
  /** Problems in this contributor's own directory. */
  ownIssues: ValidationIssue[]
  /** Problems anywhere else. Any of them stops the whole site build, so no page updates. */
  otherIssues: ValidationIssue[]
  isTemplate: boolean
  /** The site build would succeed. */
  builds: boolean
  page: boolean
  /** The entry in /api/pages.json, which the landing site and the home page count read. */
  feed: boolean
  /** The cohort page that would list the page, when the profile names a cohort that exists. */
  cohortPage: string | undefined
  /** Among the pages the home page shows. */
  homeRecent: boolean
  url: string
}

/** What the site would build for one contributor from the files under root, using the site's own rules. */
export function pageStatus(root: string, handle: string, siteUrl: string): PageStatus {
  const dir = handle.replace(/^@/, '').trim().toLowerCase()
  const profileFile = rel(CONTRIBUTORS_DIR, dir, PROFILE_FILE)
  const profilePath = join(root, CONTRIBUTORS_DIR, dir, PROFILE_FILE)
  const exists = existsSync(profilePath)
  let visibility: string | undefined
  if (exists) {
    const data = readYaml(readFileSync(profilePath, 'utf8'), profileFile).data as
      { visibility?: { page?: unknown } } | undefined
    const raw = data?.visibility?.page
    visibility = raw === undefined || raw === null ? undefined : String(raw)
  }

  const result = validateRepo(root)
  const prefix = rel(CONTRIBUTORS_DIR, dir)
  const own = (i: ValidationIssue) => i.file === prefix || i.file.startsWith(`${prefix}/`)
  const ownIssues = result.issues.filter(own)
  const otherIssues = result.issues.filter((i) => !own(i))
  const builds = result.issues.length === 0

  const published = builds ? publishedContributors(result) : []
  const me = published.find((c) => c.handle === dir)
  const cohortId = me?.profile.cohort
  const contributor = result.contributors.find((c) => c.dir === dir)
  return {
    handle: dir,
    profileFile,
    exists,
    visibility,
    ownIssues,
    otherIssues,
    isTemplate: contributor?.isTemplate ?? dir.startsWith('_'),
    builds,
    page: me !== undefined && isPublishable(me),
    feed: me !== undefined,
    cohortPage:
      cohortId !== undefined && result.cohorts.some((k) => k.id === cohortId) ? cohortId : undefined,
    homeRecent:
      me !== undefined &&
      byActivity(published)
        .slice(0, HOME_RECENT)
        .some((c) => c.handle === dir),
    url: pageUrl(siteUrl, dir),
  }
}
