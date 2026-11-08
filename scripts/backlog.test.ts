import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SHARED_STAGE } from '@nest/schema'
import { describe, expect, it } from 'vitest'
import { createArgs, issueLabels, parseBacklog } from './backlog.mjs'

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

describe('opening the shared pool', () => {
  const issues = parseBacklog(text) as { title: string; track: string }[]
  const labelsOf = (args: string[]) => args.flatMap((a, i) => (args[i - 1] === '--label' ? [a] : []))

  it('reads every section with its track', () => {
    expect(issues.length).toBe(text.split(/^## /m).length - 1)
    for (const issue of issues) expect(['js', 'python']).toContain(issue.track)
  })

  it.each(issues.map((i) => [i.title, i]))(
    '%s is created with good-shared-issue, stage:5 and its track label',
    (_title, issue) => {
      const labels = labelsOf(createArgs('kestrel-collective/nest', issue) as string[])
      expect(labels).toEqual(['good-shared-issue', `stage:${SHARED_STAGE}`, `track:${issue.track}`])
    },
  )

  it('labels every good-shared-issue with stage:5, whatever its track', () => {
    for (const track of ['js', 'python']) {
      const labels = issueLabels(track) as string[]
      expect(labels).toContain('good-shared-issue')
      expect(labels).toContain(`stage:${SHARED_STAGE}`)
    }
  })

  it('the shared-issue form opens an issue with both labels too', () => {
    const form = readFileSync(
      fileURLToPath(new URL('../.github/ISSUE_TEMPLATE/shared-issue.yml', import.meta.url)),
      'utf8',
    )
    const labels = /^labels: \[(.*)\]$/m
      .exec(form)?.[1]
      ?.split(',')
      .map((l) => l.trim().replace(/'/g, ''))
    expect(labels).toEqual(['good-shared-issue', `stage:${SHARED_STAGE}`])
  })
})
