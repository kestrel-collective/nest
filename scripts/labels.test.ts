import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { report, syncLabels } from '../.github/scripts/sync-labels.mjs'

type Label = { name: string; color: string; description: string }
const labels = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.github/labels.json', import.meta.url)), 'utf8'),
) as Label[]

describe('Sync labels', () => {
  it('syncs every label when none fails, and exits 0', () => {
    const seen: string[] = []
    const result = syncLabels(labels, (l: Label) => seen.push(l.name))
    expect(seen).toEqual(labels.map((l) => l.name))
    expect(result.failed).toEqual([])
    expect(report(result)).toEqual({ lines: [`${labels.length} label(s) synced.`], code: 0 })
  })

  it('carries on past a failing label, lists every failure and exits 1', () => {
    const failing = new Set(['stage:5', 'track:js'])
    const seen: string[] = []
    const result = syncLabels(labels, (l: Label) => {
      seen.push(l.name)
      if (failing.has(l.name)) {
        throw Object.assign(new Error('Command failed'), {
          stderr: `HTTP 422: ${l.name} rejected\nmore detail`,
        })
      }
    })
    expect(seen).toEqual(labels.map((l) => l.name))
    expect(result.synced).toHaveLength(labels.length - 2)
    expect(result.failed).toEqual([
      { name: 'stage:5', reason: 'HTTP 422: stage:5 rejected' },
      { name: 'track:js', reason: 'HTTP 422: track:js rejected' },
    ])
    const { lines, code } = report(result)
    expect(code).toBe(1)
    expect(lines).toEqual([
      `${labels.length - 2} label(s) synced.`,
      '2 label(s) failed:',
      '- stage:5: HTTP 422: stage:5 rejected',
      '- track:js: HTTP 422: track:js rejected',
    ])
  })

  it('reports an error with no output by its message', () => {
    const result = syncLabels([labels[0]!], () => {
      throw new Error('spawn gh ENOENT')
    })
    expect(result.failed).toEqual([{ name: labels[0]!.name, reason: 'spawn gh ENOENT' }])
  })

  it('defines every label the shared pool and the stage issues need', () => {
    const names = labels.map((l) => l.name)
    for (const n of ['good-shared-issue', 'onboarding', 'track:js', 'track:python'])
      expect(names).toContain(n)
    for (let s = 1; s <= 7; s++) expect(names).toContain(`stage:${s}`)
    for (const l of labels) expect(l.color).toMatch(/^[0-9a-f]{6}$/i)
  })
})
