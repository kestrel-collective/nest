import { z } from 'zod'
import { COHORT_ID_PATTERN } from './handle.js'

/** The two onboarding tracks (ADR 0010). A member with no track named is on the js track. */
export const TRACKS = ['js', 'python'] as const
export type Track = (typeof TRACKS)[number]
export const DEFAULT_TRACK: Track = 'js'
export const isTrack = (value: unknown): value is Track => TRACKS.includes(value as Track)

/**
 * cohort.yml as written. A member is a handle (js track), or a mapping with handle and track.
 * Members are checked one by one in validateCohort, so each problem names its item.
 */
export const CohortFileSchema = z.strictObject({
  id: z.string().regex(COHORT_ID_PATTERN),
  name: z.string().trim().min(1).max(80),
  starts: z.iso.date(),
  ends: z.iso.date(),
  members: z.array(z.unknown()).max(200),
  /** The planted-defect tier for this cohort's scaffolds, 1 easy to 3 hard (ADR 0009). Default 1. */
  defect_tier: z.number().int().min(1).max(3).optional(),
})

/** A validated cohort: members as handles, and every member's track. */
export type Cohort = Omit<z.infer<typeof CohortFileSchema>, 'members'> & {
  members: string[]
  tracks: Record<string, Track>
}

/** Kept for callers that parse a cohort file without line numbers; members stay unchecked. */
export const CohortSchema = CohortFileSchema

/** The member's track, js when the cohort does not name one. */
export function trackOf(cohort: Cohort | undefined, handle: string): Track {
  return cohort?.tracks[handle] ?? DEFAULT_TRACK
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "2027-01" becomes "January 2027 cohort"; "2026-11-02" becomes "Cohort starting 2 November 2026". */
export function cohortDisplayName(id: string): string {
  const [year, month, day] = id.split('-')
  const name = MONTHS[Number(month) - 1]
  if (!name) return `Cohort ${id}`
  return day ? `Cohort starting ${Number(day)} ${name} ${year}` : `${name} ${year} cohort`
}
