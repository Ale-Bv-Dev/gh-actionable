import { describe, it, expect } from "vitest"

import {
  normalizeIssue,
  deriveCommentMeta,
  deriveLastHumanActivityAt,
  deriveHasStructuredBody,
} from "../src/github/normalize.js"
import type { GitHubCommentSummary } from "../src/github/types.js"
import type { RawGitHubIssue } from "../src/github/fetch.js"
import type { RepoRef } from "../src/domain/issue.js"

// --- Helpers ---

const REPO: RepoRef = { owner: "test", name: "repo" }

function makeRawIssue(overrides: Partial<RawGitHubIssue> = {}): RawGitHubIssue {
  return {
    number: 42,
    title: "Fix the widget",
    html_url: "https://github.com/test/repo/issues/42",
    state: "open",
    labels: [{ name: "good first issue" }],
    assignees: [],
    user: { login: "alice", type: "User" },
    body: "Something is broken in the widget module.",
    comments: 2,
    updated_at: "2026-04-10T12:00:00Z",
    created_at: "2026-03-01T10:00:00Z",
    ...overrides,
  }
}

function makeComment(overrides: Partial<GitHubCommentSummary> = {}): GitHubCommentSummary {
  return {
    authorLogin: "bob",
    authorType: "user",
    body: "I can help with this",
    createdAt: "2026-04-08T12:00:00Z",
    ...overrides,
  }
}

// === normalizeIssue ===

describe("normalizeIssue", () => {
  it("maps all fields correctly from raw issue", () => {
    const raw = makeRawIssue()
    const comments = [makeComment()]
    const result = normalizeIssue(raw, comments, [], REPO)

    expect(result.repo).toEqual(REPO)
    expect(result.number).toBe(42)
    expect(result.title).toBe("Fix the widget")
    expect(result.url).toBe("https://github.com/test/repo/issues/42")
    expect(result.state).toBe("open")
    expect(result.labels).toEqual(["good first issue"])
    expect(result.assigneeCount).toBe(0)
    expect(result.hasAssignee).toBe(false)
    expect(result.linkedOpenPrCount).toBe(0)
    expect(result.updatedAt).toBe("2026-04-10T12:00:00Z")
    expect(result.body).toBe("Something is broken in the widget module.")
  })

  it("counts assignees correctly", () => {
    const raw = makeRawIssue({ assignees: [{}, {}] })
    const result = normalizeIssue(raw, [], [], REPO)
    expect(result.assigneeCount).toBe(2)
    expect(result.hasAssignee).toBe(true)
  })

  it("counts linked open PRs", () => {
    const linkedPrs = [
      { number: 10, isOpen: true, url: "https://github.com/test/repo/pull/10" },
      { number: 11, isOpen: true, url: "https://github.com/test/repo/pull/11" },
    ]
    const result = normalizeIssue(makeRawIssue(), [], linkedPrs, REPO)
    expect(result.linkedOpenPrCount).toBe(2)
  })

  it("maps closed state", () => {
    const raw = makeRawIssue({ state: "closed" })
    const result = normalizeIssue(raw, [], [], REPO)
    expect(result.state).toBe("closed")
  })

  it("extracts labels by name, skips empty", () => {
    const raw = makeRawIssue({
      labels: [{ name: "bug" }, { name: "" }, { name: "help wanted" }, {}],
    })
    const result = normalizeIssue(raw, [], [], REPO)
    expect(result.labels).toEqual(["bug", "help wanted"])
  })

  it("classifies issue author for human activity", () => {
    const raw = makeRawIssue({
      user: { login: "alice", type: "User" },
      created_at: "2026-04-12T00:00:00Z",
      comments: 0,
    })
    const result = normalizeIssue(raw, [], [], REPO)
    expect(result.lastHumanActivityAt).toBe("2026-04-12T00:00:00Z")
  })

  it("does not use created_at as human activity for bot authors", () => {
    const raw = makeRawIssue({
      user: { login: "dependabot[bot]", type: "Bot" },
      comments: 0,
    })
    const result = normalizeIssue(raw, [], [], REPO)
    expect(result.lastHumanActivityAt).toBeNull()
  })
})

// === deriveCommentMeta ===

describe("deriveCommentMeta", () => {
  it("returns nulls for empty comments", () => {
    const meta = deriveCommentMeta([], 0)
    expect(meta.totalCount).toBe(0)
    expect(meta.lastCommentAuthorType).toBeNull()
    expect(meta.lastCommentBody).toBeNull()
    expect(meta.lastCommentCreatedAt).toBeNull()
    expect(meta.lastRelevantCommentBody).toBeNull()
    expect(meta.lastRelevantCommentCreatedAt).toBeNull()
    expect(meta.lastHumanCommentAt).toBeNull()
  })

  it("uses first element as last comment (desc order)", () => {
    const comments = [
      makeComment({ authorLogin: "newest", createdAt: "2026-04-10T00:00:00Z" }),
      makeComment({ authorLogin: "older", createdAt: "2026-04-05T00:00:00Z" }),
    ]
    const meta = deriveCommentMeta(comments, 5)
    expect(meta.totalCount).toBe(5)
    expect(meta.lastCommentCreatedAt).toBe("2026-04-10T00:00:00Z")
  })

  it("finds last relevant (non-bot) comment", () => {
    const comments = [
      makeComment({ authorType: "bot", body: "Auto-assigned", createdAt: "2026-04-10T00:00:00Z" }),
      makeComment({ authorType: "user", body: "I'll take this", createdAt: "2026-04-08T00:00:00Z" }),
    ]
    const meta = deriveCommentMeta(comments, 2)
    expect(meta.lastCommentAuthorType).toBe("bot")
    expect(meta.lastRelevantCommentBody).toBe("I'll take this")
    expect(meta.lastRelevantCommentCreatedAt).toBe("2026-04-08T00:00:00Z")
  })

  it("treats unknown authors as relevant but not human", () => {
    const comments = [
      makeComment({ authorType: "unknown", body: "Mystery", createdAt: "2026-04-10T00:00:00Z" }),
    ]
    const meta = deriveCommentMeta(comments, 1)
    expect(meta.lastRelevantCommentBody).toBe("Mystery")
    expect(meta.lastHumanCommentAt).toBeNull()
  })

  it("finds last human comment among mixed authors", () => {
    const comments = [
      makeComment({ authorType: "bot", createdAt: "2026-04-10T00:00:00Z" }),
      makeComment({ authorType: "unknown", createdAt: "2026-04-09T00:00:00Z" }),
      makeComment({ authorType: "user", createdAt: "2026-04-07T00:00:00Z" }),
    ]
    const meta = deriveCommentMeta(comments, 3)
    expect(meta.lastHumanCommentAt).toBe("2026-04-07T00:00:00Z")
  })
})

// === deriveLastHumanActivityAt ===

describe("deriveLastHumanActivityAt", () => {
  it("returns null when no human signals", () => {
    const meta = deriveCommentMeta([], 0)
    const raw = makeRawIssue({ user: { login: "bot[bot]", type: "Bot" } })
    const result = deriveLastHumanActivityAt(meta, raw, "bot")
    expect(result).toBeNull()
  })

  it("uses lastHumanCommentAt when present", () => {
    const comments = [
      makeComment({ authorType: "user", createdAt: "2026-04-08T00:00:00Z" }),
    ]
    const meta = deriveCommentMeta(comments, 1)
    const raw = makeRawIssue({ created_at: "2026-03-01T00:00:00Z" })
    const result = deriveLastHumanActivityAt(meta, raw, "user")
    expect(result).toBe("2026-04-08T00:00:00Z")
  })

  it("uses created_at when author is human and no human comments", () => {
    const meta = deriveCommentMeta([], 0)
    const raw = makeRawIssue({ created_at: "2026-04-01T00:00:00Z" })
    const result = deriveLastHumanActivityAt(meta, raw, "user")
    expect(result).toBe("2026-04-01T00:00:00Z")
  })

  it("picks the most recent between comment and created_at", () => {
    const comments = [
      makeComment({ authorType: "user", createdAt: "2026-03-15T00:00:00Z" }),
    ]
    const meta = deriveCommentMeta(comments, 1)
    const raw = makeRawIssue({ created_at: "2026-04-01T00:00:00Z" })
    const result = deriveLastHumanActivityAt(meta, raw, "user")
    expect(result).toBe("2026-04-01T00:00:00Z")
  })

  it("does not use created_at when author is unknown", () => {
    const meta = deriveCommentMeta([], 0)
    const raw = makeRawIssue({ user: null })
    const result = deriveLastHumanActivityAt(meta, raw, "unknown")
    expect(result).toBeNull()
  })
})

// === deriveHasStructuredBody ===

describe("deriveHasStructuredBody", () => {
  it("returns false for null body", () => {
    expect(deriveHasStructuredBody(null)).toBe(false)
  })

  it("returns false for short body", () => {
    expect(deriveHasStructuredBody("Short body.")).toBe(false)
  })

  it("returns false for long body without structure", () => {
    const body = "a".repeat(200)
    expect(deriveHasStructuredBody(body)).toBe(false)
  })

  it("detects markdown heading", () => {
    const body = "x".repeat(100) + "\n## Steps to reproduce\nDo something"
    expect(deriveHasStructuredBody(body)).toBe(true)
  })

  it("detects markdown unordered list", () => {
    const body = "x".repeat(100) + "\n- first item\n- second item"
    expect(deriveHasStructuredBody(body)).toBe(true)
  })

  it("detects markdown ordered list", () => {
    const body = "x".repeat(100) + "\n1. first step\n2. second step"
    expect(deriveHasStructuredBody(body)).toBe(true)
  })

  it("detects code block", () => {
    const body = "x".repeat(100) + "\n```\nconst x = 1\n```"
    expect(deriveHasStructuredBody(body)).toBe(true)
  })

  it("detects HTML heading", () => {
    const body = "x".repeat(110) + "\n<h2>Details</h2>"
    expect(deriveHasStructuredBody(body)).toBe(true)
  })

  it("requires both length and structure", () => {
    expect(deriveHasStructuredBody("## Short heading")).toBe(false)
  })
})
