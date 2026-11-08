import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  buildFeed,
  buildIndex,
  byActivity,
  formatIssue,
  INDEX_FILE,
  INDEX_FORMAT,
  stagesDone,
  validateRepo,
  type Cohort,
  type Contributor,
  type NestIndex,
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

/**
 * The site's data (ADR 0010): site/.nest/data.json, written by the data step (`npm run data`, which runs
 * `nest build-data` from py/). In CI and on Cloudflare the file is required. On your own machine without
 * Python the site computes the same data with @nest/schema, so the js track needs no Python; the parity
 * goldens in py/tests/golden hold the two to the same bytes.
 */
function loadIndex(): NestIndex {
  const file = join(ROOT, INDEX_FILE)
  if (existsSync(file)) {
    const index = JSON.parse(readFileSync(file, 'utf8')) as NestIndex
    if (index.format !== INDEX_FORMAT)
      throw new Error(
        `${INDEX_FILE} is format ${index.format}; this site reads ${INDEX_FORMAT}. Run npm run data, or nest build-data on the python track.`,
      )
    return index
  }
  if ((process.env.CI || process.env.CF_PAGES) && !process.env.NEST_INDEX_FALLBACK)
    throw new Error(
      `${INDEX_FILE} is missing. The data step (npm run data, or nest build-data on the python track) writes it before the site builds.`,
    )
  const result = validateRepo(ROOT)
  if (result.issues.length > 0) {
    throw new Error(
      `nest validate found problems. Fix them before building the site:\n${result.issues.map(formatIssue).join('\n')}`,
    )
  }
  return buildIndex(result, pkg.version)
}

const index = loadIndex()

/** Pages that may appear on the site: public, valid handle, not a template. The data file holds no others. */
export const contributors: Contributor[] = index.contributors

export const cohorts: Cohort[] = [...index.cohorts].sort((a, b) => b.id.localeCompare(a.id))

export const feed = buildFeed(index.contributors, { release: index.release, siteUrl: SITE.url })

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
