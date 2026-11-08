import {
  formatIssue,
  listCohortIds,
  listContributorDirs,
  validateRepo,
  type ValidationIssue,
} from '@nest/schema'
import type { Io } from '../io.js'
import type { RepoConfig } from '../root.js'

/**
 * Reading order: by file in plain character order (the same on every machine and in nest_data),
 * then by line, with problems that have no line last.
 */
export function sortIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  const byFile = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return [...issues].sort((a, b) => byFile(a.file, b.file) || (a.line ?? Infinity) - (b.line ?? Infinity))
}

/** Prints every problem as file:line field: sentence. Exit code 1 when there are any. */
export function runValidate(config: RepoConfig, io: Io): number {
  const result = validateRepo(config.root)
  for (const issue of sortIssues(result.issues)) io.err(formatIssue(issue))
  const dirs = listContributorDirs(config.root)
  const templates = dirs.filter((d) => d.startsWith('_')).length
  const cohorts = listCohortIds(config.root).length
  const people = dirs.length - templates
  const what = `${people} contributor director${people === 1 ? 'y' : 'ies'}, ${templates} template${templates === 1 ? '' : 's'} and ${cohorts} cohort${cohorts === 1 ? '' : 's'}`
  if (result.issues.length === 0) {
    io.out(`Checked ${what}: no problems.`)
    return 0
  }
  io.err(`${result.issues.length} problem${result.issues.length === 1 ? '' : 's'} found in ${what}.`)
  return 1
}
