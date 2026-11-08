import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALLOWED_CONTRIBUTOR_FILE,
  CONTRIBUTORS_DIR,
  IGNORED_CONTRIBUTOR_ENTRY,
  PAGE_FILE,
  PRACTICE_FILE,
  PROFILE_FILE,
  readPractice,
  rel,
} from './files.js'
import { explainHandle, isHandle, isTemplateDir } from './handle.js'
import { fromZodError, type ValidationIssue } from './issues.js'
import { parsePage, publishIssues, type Page } from './page.js'
import type { Practice } from './practice.js'
import { isPlaceholder, ProfileSchema, type Profile } from './profile.js'
import { readYaml } from './yaml.js'

export type Contributor = {
  /** The directory name under contributors/. */
  dir: string
  handle: string
  isTemplate: boolean
  profile: Profile
  page: Page
  practice: Practice
}

export type ContributorResult = { contributor?: Contributor; issues: ValidationIssue[] }

/** Validates one contributor directory. Never throws on bad content. */
export function validateContributor(root: string, dir: string): ContributorResult {
  const issues: ValidationIssue[] = []
  const dirPath = join(root, CONTRIBUTORS_DIR, dir)
  const isTemplate = isTemplateDir(dir)
  const profileFile = rel(CONTRIBUTORS_DIR, dir, PROFILE_FILE)
  const pageFile = rel(CONTRIBUTORS_DIR, dir, PAGE_FILE)

  if (!isTemplate) {
    const why = explainHandle(dir)
    if (why)
      issues.push({
        file: rel(CONTRIBUTORS_DIR, dir),
        field: 'directory',
        message: `the directory name ${why}`,
      })
  }

  for (const name of readdirSync(dirPath).sort()) {
    if (name === IGNORED_CONTRIBUTOR_ENTRY) continue
    if (!ALLOWED_CONTRIBUTOR_FILE.test(name)) {
      issues.push({
        file: rel(CONTRIBUTORS_DIR, dir, name),
        field: 'file',
        message:
          'does not belong here. A contributor directory holds profile.yml, page.md, .practice.json, README.md, *.test.ts and test_*.py files only.',
      })
    }
  }

  const profilePath = join(dirPath, PROFILE_FILE)
  if (!existsSync(profilePath)) {
    issues.push({
      file: profileFile,
      field: '(file)',
      message: 'is missing. Every contributor directory needs one.',
    })
    return { issues }
  }
  const yaml = readYaml(readFileSync(profilePath, 'utf8'), profileFile)
  issues.push(...yaml.syntaxIssues)
  if (yaml.data === undefined) return { issues }
  const parsed = ProfileSchema.safeParse(yaml.data)
  if (!parsed.success) {
    issues.push(...fromZodError(parsed.error, profileFile, yaml.lineOf, yaml.keyLineOf))
    return { issues }
  }
  const profile = parsed.data
  const isPublic = profile.visibility.page === 'public'
  const push = (path: PropertyKey[], field: string, message: string) => {
    const line = yaml.lineOf(path)
    issues.push({ file: profileFile, ...(line === undefined ? {} : { line }), field, message })
  }

  if (profile.handle !== dir) push(['handle'], 'handle', `must match the directory name exactly: "${dir}".`)
  else if (!isTemplate) {
    const why = explainHandle(profile.handle)
    if (why) push(['handle'], 'handle', why)
  }
  if (isTemplate && isPublic)
    push(['visibility', 'page'], 'visibility.page', 'must stay "private" in a template directory.')

  const seenSkills = new Map<string, number>()
  profile.skills_developing.forEach((skill, i) => {
    const first = seenSkills.get(skill.toLowerCase())
    if (first === undefined) seenSkills.set(skill.toLowerCase(), i)
    else
      push(
        ['skills_developing', i],
        `skills_developing[${i}]`,
        `repeats "${skill}" from item ${first + 1}. List each skill once.`,
      )
  })
  if (isPublic && isPlaceholder(profile.intro))
    push(['intro'], 'intro', 'still has the template text. Write one or two sentences about yourself.')
  if (isPublic && isPlaceholder(profile.name))
    push(['name'], 'name', 'still has the template text. Use the name you want on your page.')

  const pagePath = join(dirPath, PAGE_FILE)
  let page: Page = { sections: [] }
  if (!existsSync(pagePath)) {
    issues.push({
      file: pageFile,
      field: '(file)',
      message: 'is missing. Every contributor directory needs one, even if it only has the headings.',
    })
  } else {
    const result = parsePage(readFileSync(pagePath, 'utf8'), pageFile)
    page = result.page
    issues.push(...result.issues)
    if (isPublic) issues.push(...publishIssues(page, pageFile))
  }

  const practice = readPractice(
    join(dirPath, PRACTICE_FILE),
    rel(CONTRIBUTORS_DIR, dir, PRACTICE_FILE),
    issues,
  )

  return { contributor: { dir, handle: profile.handle, isTemplate, profile, page, practice }, issues }
}

/** True when a page may appear on the site: not a template, a valid handle, and public. */
export function isPublishable(c: Contributor): boolean {
  return !c.isTemplate && isHandle(c.handle) && c.handle === c.dir && c.profile.visibility.page === 'public'
}
