import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildIndex,
  CohortFileSchema,
  formatIssue,
  fromZodError,
  listContributorDirs,
  PracticeSchema,
  ProfileSchema,
  serializeIndex,
  validateRepo,
} from '@nest/schema'
import { parseDocument } from 'yaml'
import { runPageStatus } from './commands/page-status.js'
import { runValidate } from './commands/validate.js'
import { collectIo } from './io.js'
import { readConfig } from './root.js'

/**
 * The record of what the Node data code does, which nest_data must reproduce byte for byte
 * (ADR 0010, py/tests/fixtures/README.md). scripts/parity-goldens.mjs writes it to py/tests/golden/.
 */

/** What py/tests/golden/<case>.json records for one fixture repository. */
export type Golden = {
  validate: { code: number; out: string[]; err: string[] }
  /** The site data file's bytes, or null when the repository does not validate. */
  index: string | null
  page_status: Record<string, { code: number; out: string[] }>
}

/** Every contributor directory, plus one handle with no directory. */
export function statusHandles(root: string): string[] {
  return [...listContributorDirs(root).map((d) => d.toLowerCase()), 'test-missing']
}

/** The Node output for one fixture: validate, the index bytes, and page-status on the working tree. */
export function goldenFor(root: string): Golden {
  const running = process.env.GITHUB_REPOSITORY
  delete process.env.GITHUB_REPOSITORY
  try {
    const config = readConfig(root)
    const v = collectIo()
    const code = runValidate(config, v)
    const result = validateRepo(root)
    const release = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string })
      .version
    const index = result.issues.length === 0 ? serializeIndex(buildIndex(result, release)) : null
    const page_status: Golden['page_status'] = {}
    for (const handle of statusHandles(root)) {
      const io = collectIo()
      const c = runPageStatus(config, { handle, local: true }, io)
      page_status[handle] = { code: c, out: io.lines }
    }
    return { validate: { code, out: v.lines, err: v.errors }, index, page_status }
  } finally {
    if (running !== undefined) process.env.GITHUB_REPOSITORY = running
  }
}

/** One input to one schema, and what the Node schema made of it (py/tests/golden/schema-cases.json). */
export type SchemaCase = {
  schema: 'profile' | 'cohort' | 'practice'
  /** The field changed from a valid base, as a path; [] for the whole value. */
  path: (string | number)[]
  /** The value put there; absent means the field was removed. */
  value?: unknown
  issues: string[]
  /** The parsed value when there were no issues. */
  output?: unknown
}

const BASES = {
  profile: {
    handle: 'test-one',
    name: 'Fixture',
    cohort: '2027-01',
    joined: '2027-01-12',
    intro: 'Fixture text.',
    skills_developing: ['debugging'],
    next: 'Something.',
    visibility: { page: 'public' },
    projects: [{ title: 'T', repo: 'owner/name', url: 'https://example.test/1', merged: '2027-02-01' }],
  },
  cohort: {
    id: '2027-01',
    name: 'January 2027 cohort',
    starts: '2027-01-12',
    ends: '2027-04-30',
    members: ['test-one'],
    defect_tier: 1,
  },
  practice: { updated_at: '2027-01-12T09:30:00Z', practice: 1, shared: 0, stages_done: [1] },
} as const

type SchemaName = keyof typeof BASES

const FIELDS: Record<SchemaName, (string | number)[][]> = {
  profile: [
    ['handle'],
    ['name'],
    ['cohort'],
    ['joined'],
    ['intro'],
    ['skills_developing'],
    ['skills_developing', 0],
    ['next'],
    ['visibility'],
    ['visibility', 'page'],
    ['projects'],
    ['projects', 0],
    ['projects', 0, 'title'],
    ['projects', 0, 'repo'],
    ['projects', 0, 'url'],
    ['projects', 0, 'merged'],
    ['extra'],
    ['visibility', 'extra'],
    ['projects', 0, 'extra'],
    [],
  ],
  cohort: [['id'], ['name'], ['starts'], ['ends'], ['members'], ['defect_tier'], ['extra'], []],
  practice: [['updated_at'], ['practice'], ['shared'], ['stages_done'], ['stages_done', 0], ['extra'], []],
}

const MISSING = Symbol('missing')
const rep = (n: number, c = 'a') => c.repeat(n)
const list = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

/** Values tried in every field. Chosen to hit each rule's edges, not to be realistic. */
const VALUES: unknown[] = [
  MISSING,
  null,
  true,
  false,
  0,
  1,
  -1,
  1.5,
  2,
  3,
  4,
  7,
  8,
  200,
  201,
  1e21,
  '',
  ' ',
  '  x  ',
  'x',
  '\u00a0x\u00a0',
  '\ufeffx',
  '\u0085x',
  'public',
  'private',
  'Public',
  '2027-01',
  '2027-1',
  '2027-13',
  '2027-01-12',
  '2027-02-30',
  '2028-02-29',
  '2100-02-29',
  '2000-02-29',
  '2027-01-12T09:30:00Z',
  '2027-01-12T09:30:00.123Z',
  '2027-01-12T09:30Z',
  '2027-01-12T09:30:00+01:00',
  '2027-01-12 09:30:00Z',
  'https://example.test/x',
  ' https://example.test/x ',
  'https://exa\tmple.test',
  'http:example.test',
  'not a url',
  'mailto:a@b',
  'a:b',
  'https://',
  'https://exa mple.test',
  'ftp://x.test',
  'https://example.test:99999/',
  'https://[::1]/x',
  'owner/name',
  'o.w_n-er/na.me',
  'owner/',
  '/name',
  'a/b/c',
  'test-one',
  'Replace this',
  rep(40),
  rep(41),
  rep(80),
  rep(81),
  rep(120),
  rep(121),
  rep(200),
  rep(201),
  rep(280),
  rep(281),
  '\u{1f985}'.repeat(20),
  '\u{1f985}'.repeat(21),
  '\u{1f985}'.repeat(40),
  '\u{1f985}'.repeat(41),
  [],
  ['x'],
  [1],
  [''],
  ['a', 'a'],
  list(8, 's'),
  list(9, 's'),
  list(51, 'p'),
  list(201, 'm'),
  [1, 2, 3, 4, 5, 6, 7, 1],
  {},
  { page: 'public' },
  { x: 1 },
  { title: 'T' },
]

function withValue(base: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value === MISSING ? undefined : value
  const copy = JSON.parse(JSON.stringify(base)) as Record<string | number, unknown>
  let at = copy
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]!
  if (value === MISSING) delete at[last]
  else at[last] = value
  return copy
}

/** Every field of every schema with every value: the zod behaviour nest_data must reproduce. */
export function schemaCases(): SchemaCase[] {
  const out: SchemaCase[] = []
  const none = () => undefined
  const schemas = { profile: ProfileSchema, cohort: CohortFileSchema, practice: PracticeSchema }
  const files = { profile: 'profile.yml', cohort: 'cohort.yml', practice: '.practice.json' }
  for (const name of Object.keys(BASES) as SchemaName[]) {
    for (const path of FIELDS[name]) {
      for (const value of VALUES) {
        const input = withValue(BASES[name], path, value)
        const r = schemas[name].safeParse(input)
        const c: SchemaCase = { schema: name, path, issues: [] }
        if (value !== MISSING) c.value = value
        if (r.success) c.output = r.data
        else c.issues = fromZodError(r.error, files[name], none, none).map(formatIssue)
        out.push(c)
      }
    }
  }
  return out
}

/** YAML snippets: what the yaml package (YAML 1.2, core schema) reads from each, or that it refuses it. */
export const YAML_SNIPPETS: string[] = [
  'v: yes',
  'v: no',
  'v: on',
  'v: off',
  'v: y',
  'v: true',
  'v: True',
  'v: TRUE',
  'v: tRUE',
  'v: false',
  'v: null',
  'v: Null',
  'v: NULL',
  'v: ~',
  'v:',
  'v: nULL',
  'v: 1',
  'v: -1',
  'v: +1',
  'v: 012',
  'v: 0o17',
  'v: 0x1F',
  'v: 0b101',
  'v: 1_000',
  'v: 1:20',
  'v: 1.5',
  'v: 1.',
  'v: .5',
  'v: 1e3',
  'v: 1E-2',
  'v: .inf',
  'v: -.Inf',
  'v: .NaN',
  'v: 2027-01-12',
  'v: 2027-01-12T09:30:00Z',
  "v: ''",
  'v: ""',
  'v: "a\\tb\\u00e9\\x41"',
  "v: 'it''s'",
  'v: plain text # comment',
  'v: a#b',
  'v: >\n  folded\n  text\n',
  'v: |\n  literal\n  text\n',
  'v: |-\n  strip\n',
  'v: |+\n  keep\n\n',
  'v: multi\n  line\n  plain',
  'v: !!str 1',
  'a: &x 1\nb: *x',
  'v: [1, two, "3"]',
  'v: {a: 1, b: [x]}',
  'v:\n  - a\n  - b',
  'v:\n- a\n- b',
  '<<: {a: 1}\nb: 2',
  'a: 1\na: 2',
  '1: one',
  'v: "unterminated',
  'v: [unclosed',
  '- a\n- b',
  'just text',
  '',
  '# only a comment',
  'v: @at',
  'v: `tick',
  '\ufeffv: bom',
  'key with spaces: 1',
  '"quoted key": 1',
  'v: x\r\nw: y\r\n',
  'v: |\r\n  crlf\r\n  block\r\n',
]

export type YamlCase = { text: string; error: boolean; data?: unknown }

export function yamlCases(): YamlCase[] {
  return YAML_SNIPPETS.map((text) => {
    const doc = parseDocument(text, { prettyErrors: false })
    if (doc.errors.length > 0) return { text, error: true }
    return { text, error: false, data: doc.toJS() as unknown }
  })
}
