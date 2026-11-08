import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SHARED_STAGE, TRACKS } from '@nest/schema'
import { describe, expect, it } from 'vitest'
import { createIssue, ensureLabels, issueLabels, parseBacklog } from './backlog.mjs'

const text = readFileSync(fileURLToPath(new URL('../docs/backlog-seed.md', import.meta.url)), 'utf8')

describe('docs/backlog-seed.md', () => {
  const issues = text.split(/^## /m).slice(1)

  it('holds the Stage 5 issues, five or more of them for the python track (ADR 0010)', () => {
    expect(issues.length).toBeGreaterThanOrEqual(15)
    expect(issues.filter((i) => /^Track: python$/m.test(i)).length).toBeGreaterThanOrEqual(5)
  })

  it.each(issues.map((i) => [i.split('\n')[0] ?? '', i]))('%s names its track', (_title, body) => {
    expect(body).toMatch(/^[^\n]*\n\nTrack: (js|python)\n/)
  })

  it.each(issues.map((i) => [i.split('\n')[0] ?? '', i]))(
    '%s has why, steps and done-when sections',
    (_title, body) => {
      expect(body).toContain('### Why')
      expect(body).toContain('### Steps')
      expect(body).toContain('### Done when')
      expect(body).toMatch(/- \[ \] /)
      expect(body).toMatch(/^1\. /m)
    },
  )
})

type Issue = { title: string; track: string }
type Call = { args: string[]; input?: string }
const file = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')
const definitions = JSON.parse(file('.github/labels.json')) as {
  name: string
  color: string
  description: string
}[]

/** A fake gh: records every call and answers from `answer`, which sees the arguments and the input. */
function fakeGh(answer: (args: string[], input?: string) => string) {
  const calls: Call[] = []
  const gh = (args: string[], input?: string) => {
    calls.push(input === undefined ? { args } : { args, input })
    return answer(args, input)
  }
  return { gh, calls }
}
const labelList = (names: string[]) => JSON.stringify(names.map((name) => ({ name })))
const named = (names: string[]) => names.map((name) => ({ name }))

describe('the labels of a shared-pool issue', () => {
  const issues = parseBacklog(text) as Issue[]

  it('reads every section with its track', () => {
    expect(issues.length).toBe(text.split(/^## /m).length - 1)
    for (const issue of issues) expect(TRACKS).toContain(issue.track)
  })

  it('opens at least five issues on each track', () => {
    for (const track of TRACKS)
      expect(issues.filter((i) => i.track === track).length).toBeGreaterThanOrEqual(5)
  })

  it.each(issues.map((i) => [i.title, i]))(
    '%s gets good-shared-issue, stage:5 and its track',
    (_t, issue) => {
      expect(issueLabels(issue.track)).toEqual([
        'good-shared-issue',
        `stage:${SHARED_STAGE}`,
        `track:${issue.track}`,
      ])
    },
  )

  it('refuses an issue without a track, so the three labels always go together', () => {
    expect(() => issueLabels(undefined)).toThrow(/needs a track/)
    expect(() => issueLabels('go')).toThrow(/needs a track/)
  })

  it('uses only labels that .github/labels.json defines', () => {
    for (const track of TRACKS) {
      for (const label of issueLabels(track)) expect(definitions.map((d) => d.name)).toContain(label)
    }
  })

  it.each(TRACKS.map((t) => [t]))('the %s shared-issue form applies the same three labels', (track) => {
    const form = file(`.github/ISSUE_TEMPLATE/shared-issue-${track}.yml`)
    const labels = /^labels: \[(.*)\]$/m
      .exec(form)?.[1]
      ?.split(',')
      .map((l) => l.trim().replace(/'/g, ''))
    expect(labels).toEqual(issueLabels(track))
  })
})

describe('creating a shared-pool issue', () => {
  const issue: Issue = { title: 'Tests for the format helpers', track: 'js' }
  const repo = 'kestrel-collective/nest'

  it('creates the missing labels from .github/labels.json before anything else', () => {
    const { gh, calls } = fakeGh(() => labelList(['good-shared-issue', 'stage:5', 'track:python']))
    const made = ensureLabels(repo, issueLabels('js'), definitions, gh)
    expect(made).toEqual(['track:js'])
    const js = definitions.find((d) => d.name === 'track:js')!
    expect(calls[1]?.args).toEqual([
      'label',
      'create',
      'track:js',
      '--repo',
      repo,
      '--color',
      js.color,
      '--description',
      js.description,
    ])
    expect(calls).toHaveLength(2)
  })

  it('creates nothing when every label exists', () => {
    const { gh, calls } = fakeGh(() => labelList(definitions.map((d) => d.name)))
    expect(ensureLabels(repo, [...issueLabels('js'), ...issueLabels('python')], definitions, gh)).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('refuses a label that labels.json does not define, before creating any', () => {
    const { gh, calls } = fakeGh(() => labelList([]))
    expect(() => ensureLabels(repo, ['stage:5', 'track:go'], definitions, gh)).toThrow(/track:go/)
    expect(calls).toHaveLength(1)
  })

  it('sends the three labels with the issue and checks them in the response', () => {
    const { gh, calls } = fakeGh((_args, input) => {
      const sent = JSON.parse(input ?? '{}') as { labels: string[] }
      return JSON.stringify({ number: 70, html_url: 'https://x/70', labels: named(sent.labels) })
    })
    expect(createIssue(repo, issue, 'body\n', gh)).toEqual({
      number: 70,
      url: 'https://x/70',
      labels: ['good-shared-issue', 'stage:5', 'track:js'],
    })
    expect(calls[0]?.args).toEqual(['api', `repos/${repo}/issues`, '--method', 'POST', '--input', '-'])
    expect(JSON.parse(calls[0]?.input ?? '')).toEqual({
      title: issue.title,
      body: 'body\n',
      labels: ['good-shared-issue', 'stage:5', 'track:js'],
    })
    expect(calls).toHaveLength(1)
  })

  it('adds a label the response is missing, and accepts the issue once it is there', () => {
    const { gh, calls } = fakeGh((args) =>
      args[1]?.endsWith('/labels')
        ? JSON.stringify(named(['good-shared-issue', 'stage:5', 'track:js']))
        : JSON.stringify({
            number: 71,
            html_url: 'https://x/71',
            labels: named(['good-shared-issue', 'track:js']),
          }),
    )
    expect(createIssue(repo, issue, 'b', gh).number).toBe(71)
    expect(calls[1]?.args[1]).toBe(`repos/${repo}/issues/71/labels`)
    expect(JSON.parse(calls[1]?.input ?? '')).toEqual({ labels: ['stage:5'] })
  })

  it('fails, naming the issue, when a label is still missing', () => {
    const { gh } = fakeGh((args) =>
      args[1]?.endsWith('/labels')
        ? JSON.stringify(named(['good-shared-issue']))
        : JSON.stringify({ number: 72, html_url: 'https://x/72', labels: named(['good-shared-issue']) }),
    )
    expect(() => createIssue(repo, issue, 'b', gh)).toThrow(/#72 .* without stage:5, track:js/)
  })
})

describe('the Stage 5 link on each track', () => {
  /** The labels a pool link filters by, from its q= query. */
  const linkLabels = (url: string) =>
    (new URL(url.replace('{{repo_url}}', 'https://github.com/o/r')).searchParams.get('q') ?? '')
      .split(' ')
      .filter((t) => t.startsWith('label:'))
      .map((t) => t.slice('label:'.length))
  const links = (body: string) => [...body.matchAll(/\]\((\S+?\/issues\?q=[^)\s]+)\)/g)].map((m) => m[1]!)

  it.each(TRACKS.map((t) => [t]))(
    "the %s Stage 5 issue sends a member to their own track's pool",
    (track) => {
      const found = links(file(`stages/05-ship-to-shared-code.${track}.md`))
      expect(found.length).toBeGreaterThan(0)
      for (const url of found) {
        expect(linkLabels(url).sort()).toEqual(['good-shared-issue', `track:${track}`])
        expect(url).toContain('is%3Aopen')
      }
    },
  )

  it('the contributing guide links each track to its own pool, and only to it', () => {
    const pools = links(file('docs/CONTRIBUTING.md'))
      .map(linkLabels)
      .filter((l) => l.includes('good-shared-issue'))
    for (const track of TRACKS) expect(pools).toContainEqual(['good-shared-issue', `track:${track}`])
    for (const labels of pools) expect(labels.filter((l) => l.startsWith('track:'))).toHaveLength(1)
  })
})
