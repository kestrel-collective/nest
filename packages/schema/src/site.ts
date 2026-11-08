import { isPublishable, type Contributor } from './contributor.js'
import type { RepoResult } from './repo.js'

/**
 * The pages the site builds, in one place so the site and `nest page-status` cannot disagree.
 * Only meaningful when the repository has no problems: any problem stops the site build.
 */
export function publishedContributors(result: RepoResult): Contributor[] {
  return result.contributors.filter(isPublishable)
}

/** How many pages the home page shows, most active first. Every published page is in the feed. */
export const HOME_RECENT = 3

export const activity = (c: Contributor): number => c.profile.projects.length + c.practice.shared

/** Most active first, then by handle, so the order is stable between builds. */
export function byActivity(list: readonly Contributor[]): Contributor[] {
  return [...list].sort((a, b) => activity(b) - activity(a) || a.handle.localeCompare(b.handle))
}
