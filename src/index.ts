#!/usr/bin/env node

import { run } from "./cli/run.js"
import { CliUsageError } from "./cli/args.js"
import { GitHubAuthError, GitHubApiError, GitHubRateLimitError } from "./github/errors.js"

run(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(formatError(error) + "\n")
  process.exit(1)
})

function formatError(error: unknown): string {
  if (error instanceof CliUsageError) {
    return error.message
  }
  if (error instanceof GitHubAuthError) {
    return `Authentication error: ${error.message}\nTip: set GITHUB_TOKEN or run: gh auth login`
  }
  if (error instanceof GitHubRateLimitError) {
    const suffix =
      error.retryAfterMs !== undefined
        ? ` (retry after ${Math.ceil(error.retryAfterMs / 1000)}s)`
        : ""
    return `GitHub rate limit exceeded${suffix}: ${error.message}`
  }
  if (error instanceof GitHubApiError) {
    const statusPart = error.status !== undefined ? ` (HTTP ${error.status})` : ""
    return `GitHub API error${statusPart}: ${error.message}`
  }
  if (error instanceof Error) {
    return `Unexpected error: ${error.message}`
  }
  return `Unexpected error: ${String(error)}`
}
