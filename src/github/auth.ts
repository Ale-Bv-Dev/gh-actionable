import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { GitHubAuthError } from "./errors.js"
import type { ResolvedGitHubAuth } from "./types.js"

const execFileAsync = promisify(execFile)

export async function resolveGitHubAuth(): Promise<ResolvedGitHubAuth> {
  const envToken = process.env.GITHUB_TOKEN

  if (envToken !== undefined) {
    const trimmedToken = envToken.trim()

    if (!trimmedToken) {
      throw new GitHubAuthError(
        "GITHUB_TOKEN is set but empty",
        "EMPTY_GITHUB_TOKEN"
      )
    }

    return {
      token: trimmedToken,
      source: "env",
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync("gh", ["auth", "token"])
    const token = stdout.trim()

    if (!token) {
      throw new GitHubAuthError(
        "gh auth token returned no token output",
        "INVALID_GITHUB_AUTH",
        { stderr: stderr.trim() || null }
      )
    }

    return {
      token,
      source: "gh-cli",
    }
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      throw error
    }

    throw new GitHubAuthError(
      "Unable to resolve GitHub authentication from GITHUB_TOKEN or gh auth token",
      "GITHUB_AUTH_COMMAND_FAILED",
      error
    )
  }
}

export function requireGitHubTokenValue(auth: ResolvedGitHubAuth): string {
  const token = auth.token.trim()

  if (!token) {
    throw new GitHubAuthError(
      "Resolved GitHub auth did not contain a usable token",
      "INVALID_GITHUB_AUTH"
    )
  }

  return token
}
