import type { NormalizedIssue, IssueCommentMeta, RepoRef } from "../domain/issue.js"
import type { GitHubCommentSummary, GitHubLinkedPullRequestSummary } from "./types.js"
import type { RawGitHubIssue } from "./fetch.js"
import { classifyRawAuthorType } from "./fetch.js"

// --- Constants ---

const STRUCTURED_BODY_MIN_LENGTH = 120

const STRUCTURAL_INDICATORS: readonly RegExp[] = [
  /^#{1,3}\s/m,      // markdown heading
  /^[-*]\s/m,        // markdown unordered list
  /^\d+\.\s/m,       // markdown ordered list
  /```/,             // code block
  /<h[1-3]/i,        // HTML heading
]

// --- Main normalizer ---

export function normalizeIssue(
  raw: RawGitHubIssue,
  comments: readonly GitHubCommentSummary[],
  linkedPrs: readonly GitHubLinkedPullRequestSummary[],
  repo: RepoRef
): NormalizedIssue {
  const commentMeta = deriveCommentMeta(comments, raw.comments)
  const issueAuthorType = classifyRawAuthorType(raw.user)

  return {
    repo,
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    state: raw.state === "open" ? "open" : "closed",
    labels: extractLabels(raw.labels),
    assigneeCount: raw.assignees.length,
    hasAssignee: raw.assignees.length > 0,
    linkedOpenPrCount: linkedPrs.filter((pr) => pr.isOpen).length,
    updatedAt: raw.updated_at,
    lastHumanActivityAt: deriveLastHumanActivityAt(commentMeta, raw, issueAuthorType),
    body: raw.body,
    hasStructuredBody: deriveHasStructuredBody(raw.body),
    comments: commentMeta,
  }
}

// --- Comment metadata derivation ---

export function deriveCommentMeta(
  comments: readonly GitHubCommentSummary[],
  totalCount: number
): IssueCommentMeta {
  if (comments.length === 0) {
    return {
      totalCount,
      lastCommentAuthorType: null,
      lastCommentBody: null,
      lastCommentCreatedAt: null,
      lastRelevantCommentBody: null,
      lastRelevantCommentCreatedAt: null,
      lastHumanCommentAt: null,
    }
  }

  // Comments are expected in desc order (newest first) from fetch.ts
  const lastComment = comments[0]

  const lastRelevantComment = comments.find((c) => c.authorType !== "bot") ?? null
  const lastHumanComment = comments.find((c) => c.authorType === "user") ?? null

  return {
    totalCount,
    lastCommentAuthorType: lastComment.authorType,
    lastCommentBody: lastComment.body,
    lastCommentCreatedAt: lastComment.createdAt,
    lastRelevantCommentBody: lastRelevantComment?.body ?? null,
    lastRelevantCommentCreatedAt: lastRelevantComment?.createdAt ?? null,
    lastHumanCommentAt: lastHumanComment?.createdAt ?? null,
  }
}

// --- Human activity derivation ---

export function deriveLastHumanActivityAt(
  commentMeta: IssueCommentMeta,
  raw: RawGitHubIssue,
  issueAuthorType: "bot" | "user" | "unknown"
): string | null {
  const candidates: string[] = []

  if (commentMeta.lastHumanCommentAt) {
    candidates.push(commentMeta.lastHumanCommentAt)
  }

  if (issueAuthorType === "user") {
    candidates.push(raw.created_at)
  }

  if (candidates.length === 0) {
    return null
  }

  // Return the most recent valid date
  let latest: string | null = null
  let latestTime = -Infinity

  for (const candidate of candidates) {
    const time = new Date(candidate).getTime()
    if (!Number.isNaN(time) && time > latestTime) {
      latestTime = time
      latest = candidate
    }
  }

  return latest
}

// --- Structured body heuristic ---

export function deriveHasStructuredBody(body: string | null): boolean {
  if (!body || body.length < STRUCTURED_BODY_MIN_LENGTH) {
    return false
  }

  return STRUCTURAL_INDICATORS.some((pattern) => pattern.test(body))
}

// --- Label extraction ---

function extractLabels(
  labels: readonly { name?: string }[]
): readonly string[] {
  const result: string[] = []

  for (const label of labels) {
    if (typeof label.name === "string" && label.name.length > 0) {
      result.push(label.name)
    }
  }

  return result
}
