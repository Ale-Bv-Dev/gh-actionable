export type GitHubAuthErrorCode =
  | "MISSING_GITHUB_AUTH"
  | "EMPTY_GITHUB_TOKEN"
  | "INVALID_GITHUB_AUTH"
  | "GITHUB_AUTH_COMMAND_FAILED"

export class GitHubAuthError extends Error {
  readonly code: GitHubAuthErrorCode
  readonly causeDetail?: unknown

  constructor(message: string, code: GitHubAuthErrorCode, causeDetail?: unknown) {
    super(message)
    this.name = "GitHubAuthError"
    this.code = code
    this.causeDetail = causeDetail
  }
}

export class GitHubApiError extends Error {
  readonly status?: number
  readonly requestId?: string
  readonly isRetryable: boolean
  readonly causeDetail?: unknown

  constructor(
    message: string,
    options: {
      status?: number
      requestId?: string
      isRetryable?: boolean
      causeDetail?: unknown
    } = {}
  ) {
    super(message)
    this.name = "GitHubApiError"
    this.status = options.status
    this.requestId = options.requestId
    this.isRetryable = options.isRetryable ?? false
    this.causeDetail = options.causeDetail
  }
}

export function isRetryableGitHubError(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError && error.isRetryable
}

export class GitHubRateLimitError extends GitHubApiError {
  readonly retryAfterMs?: number

  constructor(
    message: string,
    options: {
      status?: number
      requestId?: string
      retryAfterMs?: number
      causeDetail?: unknown
    } = {}
  ) {
    super(message, {
      status: options.status,
      requestId: options.requestId,
      isRetryable: true,
      causeDetail: options.causeDetail,
    })
    this.name = "GitHubRateLimitError"
    this.retryAfterMs = options.retryAfterMs
  }
}
