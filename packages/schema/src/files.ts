import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fromZodError, type ValidationIssue } from './issues.js'
import { EMPTY_PRACTICE, PracticeSchema, type Practice } from './practice.js'

export const CONTRIBUTORS_DIR = 'contributors'
export const COHORTS_DIR = 'cohorts'
export const COHORT_FILE = 'cohort.yml'
export const PROFILE_FILE = 'profile.yml'
export const PAGE_FILE = 'page.md'
export const PRACTICE_FILE = '.practice.json'

/**
 * Files allowed in a contributor directory. Tests are allowed so Stage 4 has somewhere to live:
 * *.test.ts on the js track, test_*.py on the python track (ADR 0010).
 */
export const ALLOWED_CONTRIBUTOR_FILE =
  /^(profile\.yml|page\.md|\.practice\.json|README\.md|[a-z0-9-]+\.test\.ts|test_[a-z0-9_]+\.py)$/

/** Left behind by Python when the track's tests run. Never committed (.gitignore), never reported. */
export const IGNORED_CONTRIBUTOR_ENTRY = '__pycache__'

/** Repository-relative path with forward slashes, the form used in every message. */
export const rel = (...parts: string[]): string => parts.join('/')

const none = () => undefined

function listDirs(base: string): string[] {
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((name) => statSync(join(base, name)).isDirectory())
    .sort()
}

export function listContributorDirs(root: string): string[] {
  return listDirs(join(root, CONTRIBUTORS_DIR))
}

export function listCohortIds(root: string): string[] {
  return listDirs(join(root, COHORTS_DIR))
}

/** Reads .practice.json when present. A missing file means zero counts. */
export function readPractice(path: string, file: string, issues: ValidationIssue[]): Practice {
  if (!existsSync(path)) return EMPTY_PRACTICE
  let data: unknown
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    issues.push({
      file,
      line: 1,
      field: '(file)',
      message:
        'is not valid JSON. This file is written by a workflow; restore it from main rather than editing it.',
    })
    return EMPTY_PRACTICE
  }
  const parsed = PracticeSchema.safeParse(data)
  if (!parsed.success) {
    issues.push(...fromZodError(parsed.error, file, none, none))
    return EMPTY_PRACTICE
  }
  if (new Set(parsed.data.stages_done).size !== parsed.data.stages_done.length) {
    issues.push({ file, field: 'stages_done', message: 'lists a stage twice.' })
  }
  return parsed.data
}
