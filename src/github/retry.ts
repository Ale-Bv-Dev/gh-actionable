import { GitHubRateLimitError, isRetryableGitHubError } from "./errors.js"

export interface RetryOptions {
  readonly maxAttempts: number
  readonly delayMs: number
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 2,
  delayMs: 1000,
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error

      if (!isRetryableGitHubError(error) || attempt === options.maxAttempts) {
        throw error
      }

      const delayMs = error instanceof GitHubRateLimitError ? error.retryAfterMs ?? options.delayMs : options.delayMs
      await wait(delayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry operation failed")
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}
