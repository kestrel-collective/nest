import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateContributor } from '@nest/schema'

// The repository root, two directories up from this file.
const root = fileURLToPath(new URL('../../', import.meta.url))
const handle = 'anod-a'

describe('contributors/anod-a', () => {
  it('validates without problems', () => {
    const result = validateContributor(root, handle)
    expect(result.issues).toEqual([])
  })

  // Stage 4: add the test that would have caught the defect you fixed in Stage 3.
  // Start from the shape of the test above. It should fail with the defect and pass without it.
})
