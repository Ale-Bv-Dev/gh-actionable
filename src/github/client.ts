import { Octokit } from "@octokit/rest"

import type { GitHubClientOptions } from "./types.js"
import { requireGitHubTokenValue } from "./auth.js"

const DEFAULT_USER_AGENT = "gh-actionable/0.1.0"

export function createGitHubClient(options: GitHubClientOptions): Octokit {
  return new Octokit({
    auth: requireGitHubTokenValue(options.auth),
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  })
}
