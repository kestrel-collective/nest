import type { Cohort } from './cohort.js'
import { isPublishable, type Contributor } from './contributor.js'
import { stagesDone } from './practice.js'
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

/**
 * The data file the site reads (ADR 0010). `nest build-data` in py/ writes it; the site falls back
 * to buildIndex below when it is missing outside CI, so the js track needs no Python.
 */
export const INDEX_FILE = 'site/.nest/data.json'
export const INDEX_FORMAT = 1

export type IndexContributor = Contributor & {
  /** Number of distinct stages completed, 0 to 7. */
  stage: number
}

export type NestIndex = {
  format: number
  release: string
  cohorts: Cohort[]
  /** Published pages only: private profiles never leave the repository. */
  contributors: IndexContributor[]
}

/** The index for a repository that validated. Callers refuse to build one when result.issues is not empty. */
export function buildIndex(result: RepoResult, release: string): NestIndex {
  return {
    format: INDEX_FORMAT,
    release,
    cohorts: [...result.cohorts],
    contributors: publishedContributors(result).map((c) => ({ ...c, stage: stagesDone(c.practice) })),
  }
}

/** The exact bytes of the data file. The Python writer produces the same bytes (py/tests/golden). */
export function serializeIndex(index: NestIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`
}
