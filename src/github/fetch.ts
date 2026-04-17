import type { Octokit } from "@octokit/rest"

import type { GitHubCommentSummary, GitHubLinkedPullRequestSummary } from "./types.js"
import { GitHubApiError, GitHubRateLimitError } from "./errors.js"
import { withRetry } from "./retry.js"

// --- Constants ---

const COMMENTS_PER_PAGE = 100
const MAX_COMMENT_PAGES = 3 // conservative cap: up to 300 comments per issue
const TIMELINE_PER_PAGE = 100

// --- Issue fetching ---

export interface FetchIssuesOptions {
  readonly labels: string
  readonly state: "open" | "closed" | "all"
  readonly perPage?: number
  readonly page?: number
}

export interface RawGitHubIssue {
  readonly number: number
  readonly title: string
  readonly html_url: string
  readonly state: string
  readonly labels: readonly { name?: string }[]
  readonly assignees: readonly unknown[]
  readonly user: { readonly login: string; readonly type: string } | null
  readonly body: string | null
  readonly comments: number
  readonly updated_at: string
  readonly created_at: string
  readonly pull_request?: unknown
}

export async function fetchIssuesForRepo(
  client: Octokit,
  owner: string,
  repo: string,
  options: FetchIssuesOptions
): Promise<readonly RawGitHubIssue[]> {
  return withRetry(async () => {
    const response = await wrapOctokitCall(() =>
      client.rest.issues.listForRepo({
        owner,
        repo,
        labels: options.labels,
        state: options.state,
        per_page: options.perPage ?? 100,
        page: options.page ?? 1,
        sort: "updated",
        direction: "desc",
      })
    )

    // Filter out pull requests (GitHub API returns PRs in issue endpoints)
    return response.data.filter(
      (item: { pull_request?: unknown }) => !item.pull_request
    ) as unknown as readonly RawGitHubIssue[]
  })
}

// --- Comment fetching ---

export async function fetchIssueComments(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<readonly GitHubCommentSummary[]> {
  // Collect up to MAX_COMMENT_PAGES pages so that newer comments beyond page 1 are not missed.
  // issues.listComments returns results oldest-first and does not support sort/direction.
  const allRaw: {
    user: { login: string; type: string } | null
    body?: string | null
    created_at: string
  }[] = []

  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const response = await withRetry(async () =>
      wrapOctokitCall(() =>
        client.rest.issues.listComments({
          owner,
          repo,
          issue_number: issueNumber,
          per_page: COMMENTS_PER_PAGE,
          page,
        })
      )
    )

    for (const item of response.data) {
      allRaw.push(item)
    }

    if (response.data.length < COMMENTS_PER_PAGE) {
      break
    }
  }

  // Sort newest-first across all collected pages
  const sorted = allRaw.slice().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return sorted.map(
    (comment): GitHubCommentSummary => ({
      authorLogin: comment.user?.login ?? null,
      authorType: classifyRawAuthorType(comment.user),
      body: comment.body ?? null,
      createdAt: comment.created_at,
    })
  )
}

// --- Timeline events for linked PR detection ---

export async function fetchLinkedPullRequests(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<readonly GitHubLinkedPullRequestSummary[]> {
  return withRetry(async () => {
    const response = await wrapOctokitCall(() =>
      client.rest.issues.listEventsForTimeline({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: TIMELINE_PER_PAGE,
      })
    )

    const seen = new Set<number>()
    const linked: GitHubLinkedPullRequestSummary[] = []

    for (const event of response.data) {
      const e = event as {
        event?: string
        source?: {
          issue?: {
            number: number
            state: string
            html_url: string
            pull_request?: unknown
          }
        }
      }

      if (
        e.event === "cross-referenced" &&
        e.source?.issue?.pull_request &&
        e.source.issue.state === "open" &&
        !seen.has(e.source.issue.number)
      ) {
        seen.add(e.source.issue.number)
        linked.push({
          number: e.source.issue.number,
          isOpen: true,
          url: e.source.issue.html_url,
        })
      }
    }

    return linked
  })
}

// --- CONTRIBUTING.md check ---

export async function checkContributingMd(
  client: Octokit,
  owner: string,
  repo: string
): Promise<boolean> {
  return withRetry(async () => {
    try {
      const repoResponse = await wrapOctokitCall(() =>
        client.rest.repos.get({ owner, repo })
      )
      const defaultBranch = repoResponse.data.default_branch

      const treeResponse = await wrapOctokitCall(() =>
        client.rest.git.getTree({
          owner,
          repo,
          tree_sha: defaultBranch,
          recursive: "false",
        })
      )

      return treeResponse.data.tree.some(
        (item) =>
          typeof item.path === "string" &&
          item.path.toLowerCase() === "contributing.md" &&
          (!item.type || item.type === "blob")
      )
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return false
      }
      throw error
    }
  })
}

// --- Org repository listing ---

const ORG_REPOS_PER_PAGE = 100
const MAX_ORG_REPO_LISTING_PAGES = 5 // safety cap: up to 500 repos fetched before filtering

export interface OrgRepoInfo {
  readonly owner: string
  readonly name: string
}

export async function fetchOrgRepositories(
  client: Octokit,
  org: string
): Promise<readonly OrgRepoInfo[]> {
  const collected: OrgRepoInfo[] = []

  for (let page = 1; page <= MAX_ORG_REPO_LISTING_PAGES; page++) {
    const response = await withRetry(async () =>
      wrapOctokitCall(() =>
        client.rest.repos.listForOrg({
          org,
          type: "public",
          sort: "pushed",
          direction: "desc",
          per_page: ORG_REPOS_PER_PAGE,
          page,
        })
      )
    )

    for (const repo of response.data) {
      if (!repo.fork && !repo.archived && !repo.disabled) {
        collected.push({ owner: repo.owner.login, name: repo.name })
      }
    }

    if (response.data.length < ORG_REPOS_PER_PAGE) {
      break
    }
  }

  return collected
}

// --- Author classification ---

export function classifyRawAuthorType(
  user: { login: string; type: string } | null | undefined
): "bot" | "user" | "unknown" {
  if (!user) {
    return "unknown"
  }

  if (user.type === "Bot" || user.login.endsWith("[bot]")) {
    return "bot"
  }

  return "user"
}

// --- Octokit error wrapping ---

async function wrapOctokitCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw toGitHubApiError(error)
  }
}

function toGitHubApiError(error: unknown): GitHubApiError {
  const octokitError = error as {
    status?: number
    response?: {
      headers?: Record<string, string>
      data?: { message?: string }
    }
    message?: string
  }

  const status = octokitError.status
  const requestId = octokitError.response?.headers?.["x-github-request-id"]
  const message =
    octokitError.response?.data?.message ?? octokitError.message ?? "GitHub API request failed"

  const retryAfterHeader = octokitError.response?.headers?.["retry-after"]
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined
  const hasRetryAfter = Number.isFinite(retryAfterMs)

  if (status === 429 || (status === 403 && hasRetryAfter)) {
    return new GitHubRateLimitError(message, {
      status,
      requestId,
      retryAfterMs: hasRetryAfter ? retryAfterMs : undefined,
      causeDetail: error,
    })
  }

  const isRetryable = status !== undefined && status >= 500

  return new GitHubApiError(message, {
    status,
    requestId,
    isRetryable,
    causeDetail: error,
  })
}
