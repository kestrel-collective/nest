import { describe, expect, it } from 'vitest'
import { explainAppRefusal, explainPrRefusal } from './gh-cli.js'
import { withRetry } from './retry.js'

describe('a pull request GitHub refuses by setting', () => {
  const refusal = new Error(
    'gh pr create failed: pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)',
  )

  it('is explained with the setting to change and marked not worth retrying', () => {
    const e = explainPrRefusal(refusal) as Error & { retryable?: boolean }
    expect(e.message).toContain('Allow GitHub Actions to create and approve pull requests')
    expect(e.message).toContain('Nest bot app')
    expect(e.retryable).toBe(false)
  })

  it('leaves any other error as it was', () => {
    const other = new Error('HTTP 502')
    expect(explainPrRefusal(other)).toBe(other)
  })

  it('stops withRetry after one attempt', () => {
    let calls = 0
    expect(() =>
      withRetry(
        'scaffold pull request',
        () => {
          calls += 1
          throw explainPrRefusal(refusal)
        },
        { attempts: 3, sleep: () => undefined },
      ),
    ).toThrow(/Allow GitHub Actions/)
    expect(calls).toBe(1)
  })
})

describe("the Nest bot app's token refused for a missing permission", () => {
  const refusal = new Error(
    'gh pr create failed: pull request create failed: GraphQL: Resource not accessible by integration (createPullRequest)',
  )

  it('names the permissions the app needs and is not retried', () => {
    const e = explainPrRefusal(refusal) as Error & { retryable?: boolean }
    expect(e.message).toContain('Pull requests and Issues: Read and write')
    expect(e.message).toContain('accept the new permissions')
    expect(e.retryable).toBe(false)
  })

  it('keeps the first line of what GitHub said', () => {
    const first = 'gh issue create failed: HTTP 403: Resource not accessible by integration'
    expect(explainAppRefusal(`${first}\nmore detail`).message).toMatch(
      /^gh issue create failed: HTTP 403: Resource not accessible by integration\. The Nest bot app/,
    )
  })
})
