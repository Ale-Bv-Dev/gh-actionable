export type GitHubAuthSource = "env" | "gh-cli"

export interface ResolvedGitHubAuth {
  readonly token: string
  readonly source: GitHubAuthSource
}

export interface GitHubClientOptions {
  readonly auth: ResolvedGitHubAuth
  readonly userAgent?: string
}

export interface GitHubCommentSummary {
  readonly authorLogin: string | null
  readonly authorType: "bot" | "user" | "unknown"
  readonly body: string | null
  readonly createdAt: string
}

export interface GitHubLinkedPullRequestSummary {
  readonly number: number
  readonly isOpen: boolean
  readonly url: string
}
