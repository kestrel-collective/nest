import { DEFAULT_TRACK, type Track } from '@nest/schema'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

export type FileChange = { text: string; changed: boolean }

type Entry = { handle: string; track: Track }

/** A members item as written: a plain handle (js track) or a mapping with handle and track. */
function readEntry(item: unknown): Entry | null {
  if (isScalar(item)) return { handle: String(item.value).trim().toLowerCase(), track: DEFAULT_TRACK }
  if (isMap(item)) {
    const handle = item.get('handle')
    const track = item.get('track')
    if (typeof handle !== 'string') return null
    return { handle: handle.trim().toLowerCase(), track: track === 'python' ? 'python' : DEFAULT_TRACK }
  }
  return null
}

/** How a member is written (ADR 0010): js as the plain handle, as before tracks existed; python as a mapping. */
const writeEntry = (e: Entry): string | Entry => (e.track === DEFAULT_TRACK ? e.handle : e)

/**
 * Adds the handle to the members list of a cohort.yml with its track, keeping the list sorted and free
 * of duplicates. A member already there on another track is moved to the new one.
 */
export function addCohortMember(yamlText: string, handle: string, track: Track = DEFAULT_TRACK): FileChange {
  const doc = parseDocument(yamlText)
  const members = doc.get('members', true)
  const current = (isSeq(members) ? members.items.map(readEntry) : []).filter((e): e is Entry => e !== null)
  const byHandle = new Map(current.map((e) => [e.handle, e]))
  byHandle.set(handle.toLowerCase(), { handle: handle.toLowerCase(), track })
  const next = [...byHandle.values()].sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0))
  const written = next.map(writeEntry)
  if (JSON.stringify(current.map(writeEntry)) === JSON.stringify(written))
    return { text: yamlText, changed: false }
  doc.set('members', written)
  return { text: doc.toString(), changed: true }
}

/** The member's track in a cohort.yml, or null when they are not in it. */
export function cohortMemberTrack(yamlText: string, handle: string): Track | null {
  const members = parseDocument(yamlText).get('members', true)
  if (!isSeq(members)) return null
  for (const item of members.items) {
    const e = readEntry(item)
    if (e && e.handle === handle.toLowerCase()) return e.track
  }
  return null
}

export const CODEOWNERS_SECTION =
  '# Contributor directories, one line each, kept sorted. Added by nest enroll.'

const ownerLine = (handle: string) => `/contributors/${handle}/ @${handle}`
const OWNER_LINE = /^\/contributors\/([a-z0-9-]+)\/ @([A-Za-z0-9-]+)\s*$/

/** Ensures CODEOWNERS has the owner line for the handle, in a sorted block at the end, with no duplicates. */
export function addCodeownersLine(text: string, handle: string): FileChange {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const owners = new Map<string, string>()
  const rest: string[] = []
  for (const line of lines) {
    const m = OWNER_LINE.exec(line)
    if (m) owners.set(m[1] as string, line.trim())
    else if (line.trim() !== CODEOWNERS_SECTION) rest.push(line)
  }
  const before = [...owners.keys()].sort().join('|')
  owners.set(handle, ownerLine(handle))
  const after = [...owners.keys()].sort().join('|')
  if (before === after) return { text, changed: false }
  while (rest.length > 0 && rest[rest.length - 1]?.trim() === '') rest.pop()
  const block = [...owners.keys()].sort().map((h) => owners.get(h) as string)
  return { text: [...rest, '', CODEOWNERS_SECTION, ...block, ''].join('\n'), changed: true }
}
