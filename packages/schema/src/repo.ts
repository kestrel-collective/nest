import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CohortFileSchema, DEFAULT_TRACK, isTrack, TRACKS, type Cohort, type Track } from './cohort.js'
import { validateContributor, type Contributor } from './contributor.js'
import {
  COHORT_FILE,
  COHORTS_DIR,
  CONTRIBUTORS_DIR,
  listCohortIds,
  listContributorDirs,
  PROFILE_FILE,
  rel,
} from './files.js'
import { explainHandle, isCohortId } from './handle.js'
import { fromZodError, type ValidationIssue } from './issues.js'
import { readYaml } from './yaml.js'

export type CohortResult = { cohort?: Cohort; issues: ValidationIssue[] }

export type RepoResult = {
  contributors: Contributor[]
  cohorts: Cohort[]
  issues: ValidationIssue[]
}

/** Validates one cohort directory. Never throws on bad content. */
export function validateCohort(root: string, id: string): CohortResult {
  const issues: ValidationIssue[] = []
  const file = rel(COHORTS_DIR, id, COHORT_FILE)
  const path = join(root, COHORTS_DIR, id, COHORT_FILE)
  if (!isCohortId(id)) {
    issues.push({
      file: rel(COHORTS_DIR, id),
      field: 'directory',
      message:
        'must be named as a year and month, or as a start date, for example cohorts/2027-01/ or cohorts/2027-01-12/.',
    })
  }
  if (!existsSync(path)) {
    issues.push({ file, field: '(file)', message: 'is missing. Every cohort directory needs one.' })
    return { issues }
  }
  const yaml = readYaml(readFileSync(path, 'utf8'), file)
  issues.push(...yaml.syntaxIssues)
  if (yaml.data === undefined) return { issues }
  const parsed = CohortFileSchema.safeParse(yaml.data)
  if (!parsed.success) {
    issues.push(...fromZodError(parsed.error, file, yaml.lineOf, yaml.keyLineOf))
    return { issues }
  }
  const push = (path: PropertyKey[], field: string, message: string, keyOf?: string) => {
    const line = keyOf === undefined ? yaml.lineOf(path) : yaml.keyLineOf(path, keyOf)
    issues.push({ file, ...(line === undefined ? {} : { line }), field, message })
  }
  const members: string[] = []
  const tracks: Record<string, Track> = {}
  parsed.data.members.forEach((raw, i) => {
    const at = `members[${i}]`
    let handle: string
    let track: Track = DEFAULT_TRACK
    if (typeof raw === 'string') handle = raw.trim()
    else if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const entry = raw as Record<string, unknown>
      for (const key of Object.keys(entry))
        if (key !== 'handle' && key !== 'track')
          push(['members', i], `${at}.${key}`, 'is not a field in cohort.yml. Check the spelling.', key)
      if (entry.handle === undefined || entry.handle === null) {
        push(['members', i], `${at}.handle`, 'is required.')
        return
      }
      if (typeof entry.handle !== 'string') {
        push(['members', i, 'handle'], `${at}.handle`, 'must be a string.')
        return
      }
      handle = entry.handle.trim()
      if (entry.track === undefined || entry.track === null) {
        push(['members', i], `${at}.track`, 'is required.')
        return
      }
      if (!isTrack(entry.track)) {
        push(['members', i, 'track'], `${at}.track`, `must be ${TRACKS.map((t) => `"${t}"`).join(' or ')}.`)
        return
      }
      track = entry.track
    } else {
      push(['members', i], at, 'must be a handle, or a mapping with handle and track.')
      return
    }
    if (handle === '') {
      push(['members', i], at, 'must not be empty.')
      return
    }
    members.push(handle)
    tracks[handle] = track
  })
  const cohort: Cohort = { ...parsed.data, members, tracks }
  if (cohort.id !== id) push(['id'], 'id', `must match the directory name exactly: "${id}".`)
  if (cohort.ends < cohort.starts) push(['ends'], 'ends', 'must not be before starts.')
  const seen = new Map<string, number>()
  parsed.data.members.forEach((raw, i) => {
    const member =
      typeof raw === 'string'
        ? raw.trim()
        : raw !== null && typeof raw === 'object' && typeof (raw as { handle?: unknown }).handle === 'string'
          ? (raw as { handle: string }).handle.trim()
          : null
    if (member === null || member === '') return
    const path = typeof raw === 'string' ? ['members', i] : ['members', i, 'handle']
    const why = explainHandle(member)
    if (why) push(path, `members[${i}]`, why)
    const first = seen.get(member)
    if (first === undefined) seen.set(member, i)
    else push(path, `members[${i}]`, `repeats "${member}" from item ${first + 1}.`)
  })
  return { cohort, issues }
}

/** Validates every contributor and cohort directory. Never throws on bad content. */
export function validateRepo(root: string): RepoResult {
  const issues: ValidationIssue[] = []
  const contributors: Contributor[] = []
  const cohorts: Cohort[] = []

  for (const id of listCohortIds(root)) {
    const r = validateCohort(root, id)
    issues.push(...r.issues)
    if (r.cohort) cohorts.push(r.cohort)
  }
  const cohortIds = new Set(cohorts.map((c) => c.id))

  for (const dir of listContributorDirs(root)) {
    const r = validateContributor(root, dir)
    issues.push(...r.issues)
    if (!r.contributor) continue
    contributors.push(r.contributor)
    const cohort = r.contributor.profile.cohort
    if (cohort !== undefined && !r.contributor.isTemplate && cohortIds.size > 0 && !cohortIds.has(cohort)) {
      issues.push({
        file: rel(CONTRIBUTORS_DIR, dir, PROFILE_FILE),
        field: 'cohort',
        message: `"${cohort}" has no cohorts/${cohort}/cohort.yml. Check the id with your cohort lead.`,
      })
    }
  }
  return { contributors, cohorts, issues }
}
