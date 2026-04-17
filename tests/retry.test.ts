import { describe, it, expect } from "vitest"

import { withRetry } from "../src/github/retry.js"
import { GitHubApiError, GitHubRateLimitError } from "../src/github/errors.js"

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(async () => "ok")
    expect(result).toBe("ok")
  })

  it("retries on retryable error and succeeds", async () => {
    let attempt = 0
    const result = await withRetry(
      async () => {
        attempt += 1
        if (attempt === 1) {
          throw new GitHubRateLimitError("rate limited", { status: 429 })
        }
        return "recovered"
      },
      { maxAttempts: 2, delayMs: 0 }
    )
    expect(result).toBe("recovered")
    expect(attempt).toBe(2)
  })

  it("does not retry on non-retryable error", async () => {
    let attempt = 0
    await expect(
      withRetry(
        async () => {
          attempt += 1
          throw new GitHubApiError("forbidden", { status: 403, isRetryable: false })
        },
        { maxAttempts: 3, delayMs: 0 }
      )
    ).rejects.toThrow("forbidden")
    expect(attempt).toBe(1)
  })

  it("throws after exhausting max attempts", async () => {
    let attempt = 0
    await expect(
      withRetry(
        async () => {
          attempt += 1
          throw new GitHubRateLimitError("rate limited", { status: 429 })
        },
        { maxAttempts: 2, delayMs: 0 }
      )
    ).rejects.toThrow("rate limited")
    expect(attempt).toBe(2)
  })

  it("does not retry non-GitHubApiError exceptions", async () => {
    let attempt = 0
    await expect(
      withRetry(
        async () => {
          attempt += 1
          throw new Error("unexpected")
        },
        { maxAttempts: 3, delayMs: 0 }
      )
    ).rejects.toThrow("unexpected")
    expect(attempt).toBe(1)
  })

  it("uses retryAfterMs from rate limit error when available", async () => {
    const start = Date.now()
    let attempt = 0
    await withRetry(
      async () => {
        attempt += 1
        if (attempt === 1) {
          throw new GitHubRateLimitError("rate limited", {
            status: 429,
            retryAfterMs: 50,
          })
        }
        return "ok"
      },
      { maxAttempts: 2, delayMs: 5000 }
    )
    const elapsed = Date.now() - start
    // Should use retryAfterMs (50ms), not delayMs (5000ms)
    expect(elapsed).toBeLessThan(1000)
  })
})
