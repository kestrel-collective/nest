import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  buildFeed,
  byActivity,
  formatIssue,
  publishedContributors,
  stagesDone,
  validateRepo,
  type Cohort,
  type Contributor,
} from '@nest/schema'

export { activity, byActivity } from '@nest/schema'

/**
 * The repository root: NEST_ROOT when set (the site build test points it at a fixture), otherwise
 * found by walking up from the working directory. No network, no GitHub.
 */
function findRoot(): string {
  if (process.env.NEST_ROOT) return resolve(process.env.NEST_ROOT)
  let dir = resolve(process.cwd())
  for (;;) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'contributors'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`Could not find the repository root above ${process.cwd()}.`)
    dir = parent
  }
}

export const ROOT = findRoot()

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  repository: string
  homepage: string
  version: string
}

const slug = pkg.repository.replace(/^github:/, '')

export const SITE = {
  url: pkg.homepage.replace(/\/+$/, ''),
  slug,
  repoUrl: `https://github.com/${slug}`,
  release: pkg.version,
  landingUrl: 'https://www.kestrelcollective.org',
}

const result = validateRepo(ROOT)
if (result.issues.length > 0) {
  throw new Error(
    `nest validate found problems. Fix them before building the site:\n${result.issues.map(formatIssue).join('\n')}`,
  )
}

/** Pages that may appear on the site: public, valid handle, not a template. */
export const contributors: Contributor[] = publishedContributors(result)

export const cohorts: Cohort[] = [...result.cohorts].sort((a, b) => b.id.localeCompare(a.id))

export const feed = buildFeed(result.contributors, { release: SITE.release, siteUrl: SITE.url })

export function cohortOf(c: Contributor): Cohort | undefined {
  return cohorts.find((k) => k.id === c.profile.cohort)
}

export type CohortSummary = {
  cohort: Cohort
  published: Contributor[]
  unpublished: number
  stagesCompleted: number
  shared: number
  external: number
}

export function summarize(cohort: Cohort): CohortSummary {
  const published = byActivity(contributors.filter((c) => c.profile.cohort === cohort.id))
  const members = new Set(cohort.members)
  for (const c of published) members.add(c.handle)
  return {
    cohort,
    published,
    unpublished: Math.max(0, members.size - published.length),
    stagesCompleted: published.reduce((n, c) => n + stagesDone(c.practice), 0),
    shared: published.reduce((n, c) => n + c.practice.shared, 0),
    external: published.reduce((n, c) => n + c.profile.projects.length, 0),
  }
}
