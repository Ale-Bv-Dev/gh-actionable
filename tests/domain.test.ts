import { describe, it, expect } from "vitest"

import { evaluateHardFilters } from "../src/domain/filters.js"
import { detectGhostWarnings } from "../src/domain/warnings.js"
import { detectSoftSignals } from "../src/domain/signals.js"
import { buildWhySelected } from "../src/domain/why-selected.js"
import type { NormalizedIssue, IssueCommentMeta } from "../src/domain/issue.js"
import type { DomainEvaluationContext, GhostWarning, SoftSignal } from "../src/domain/types.js"

// --- Helpers ---

const NOW = new Date("2026-04-14T00:00:00Z")
const DAYS_AGO = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

function makeComments(overrides: Partial<IssueCommentMeta> = {}): IssueCommentMeta {
  return {
    totalCount: 1,
    lastCommentAuthorType: "user",
    lastCommentBody: "Looks good",
    lastCommentCreatedAt: DAYS_AGO(5),
    lastRelevantCommentBody: "Looks good",
    lastRelevantCommentCreatedAt: DAYS_AGO(5),
    lastHumanCommentAt: DAYS_AGO(5),
    ...overrides,
  }
}

function makeIssue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    repo: { owner: "test", name: "repo" },
    number: 1,
    title: "Test issue",
    url: "https://github.com/test/repo/issues/1",
    state: "open",
    labels: ["good first issue"],
    assigneeCount: 0,
    hasAssignee: false,
    linkedOpenPrCount: 0,
    updatedAt: DAYS_AGO(5),
    lastHumanActivityAt: DAYS_AGO(5),
    body: "A test issue body",
    hasStructuredBody: false,
    comments: makeComments(),
    ...overrides,
  }
}

function makeContext(
  issueOverrides: Partial<NormalizedIssue> = {},
  repoHasContributingMd = false
): DomainEvaluationContext {
  return {
    issue: makeIssue(issueOverrides),
    repoHasContributingMd,
    now: NOW,
  }
}

// === Hard Filters ===

describe("evaluateHardFilters", () => {
  it("passes when all conditions are met", () => {
    const result = evaluateHardFilters(makeContext())
    expect(result.passed).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  it("fails when issue is closed", () => {
    const result = evaluateHardFilters(makeContext({ state: "closed" }))
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "ISSUE_NOT_OPEN")).toBe(true)
  })

  it("fails when no actionable label", () => {
    const result = evaluateHardFilters(makeContext({ labels: ["bug"] }))
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "MISSING_ACTIONABLE_LABEL")).toBe(true)
  })

  it("accepts case-insensitive actionable labels", () => {
    const result = evaluateHardFilters(makeContext({ labels: ["Good First Issue"] }))
    expect(result.passed).toBe(true)
  })

  it("accepts help wanted label", () => {
    const result = evaluateHardFilters(makeContext({ labels: ["help wanted"] }))
    expect(result.passed).toBe(true)
  })

  it("fails when issue has assignee", () => {
    const result = evaluateHardFilters(
      makeContext({ hasAssignee: true, assigneeCount: 1 })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "HAS_ASSIGNEE")).toBe(true)
  })

  it("fails when issue has linked open PR", () => {
    const result = evaluateHardFilters(makeContext({ linkedOpenPrCount: 1 }))
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "HAS_LINKED_OPEN_PR")).toBe(true)
  })

  it("fails when issue has negative label", () => {
    const result = evaluateHardFilters(
      makeContext({ labels: ["good first issue", "wontfix"] })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "HAS_NEGATIVE_LABEL")).toBe(true)
  })

  it("detects case-insensitive negative labels", () => {
    const result = evaluateHardFilters(
      makeContext({ labels: ["good first issue", "Duplicate"] })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "HAS_NEGATIVE_LABEL")).toBe(true)
  })

  it("fails when issue has Status: Stale label", () => {
    const result = evaluateHardFilters(
      makeContext({ labels: ["good first issue", "help wanted", "Status: Stale", "product 🧰"] })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "HAS_NEGATIVE_LABEL")).toBe(true)
  })

  it("fails when issue has lowercase status: stale label", () => {
    const result = evaluateHardFilters(
      makeContext({ labels: ["good first issue", "status: stale"] })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "HAS_NEGATIVE_LABEL")).toBe(true)
  })

  it("passes when actionable labels are present without any negative label", () => {
    const result = evaluateHardFilters(
      makeContext({ labels: ["good first issue", "help wanted", "product 🧰"] })
    )
    expect(result.passed).toBe(true)
  })

  it("fails when no recent human activity", () => {
    const result = evaluateHardFilters(
      makeContext({ lastHumanActivityAt: DAYS_AGO(91) })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "LACKS_RECENT_REAL_ACTIVITY")).toBe(true)
  })

  it("passes at exactly 90 days", () => {
    const result = evaluateHardFilters(
      makeContext({ lastHumanActivityAt: DAYS_AGO(90) })
    )
    expect(result.passed).toBe(true)
  })

  it("fails when lastHumanActivityAt is null", () => {
    const result = evaluateHardFilters(
      makeContext({ lastHumanActivityAt: null })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.some((f) => f.code === "LACKS_RECENT_REAL_ACTIVITY")).toBe(true)
  })

  it("collects all failures without short-circuiting", () => {
    const result = evaluateHardFilters(
      makeContext({
        state: "closed",
        labels: ["bug"],
        hasAssignee: true,
        assigneeCount: 1,
        linkedOpenPrCount: 2,
        lastHumanActivityAt: null,
      })
    )
    expect(result.passed).toBe(false)
    expect(result.failures.length).toBeGreaterThanOrEqual(5)
  })
})

// === Ghost Warnings ===

describe("detectGhostWarnings", () => {
  it("returns empty when no ghost signals", () => {
    const warnings = detectGhostWarnings(makeIssue())
    expect(warnings).toHaveLength(0)
  })

  it("warns when last comment is from a bot", () => {
    const issue = makeIssue({
      comments: makeComments({ lastCommentAuthorType: "bot" }),
    })
    const warnings = detectGhostWarnings(issue)
    expect(warnings.some((w) => w.code === "LAST_COMMENT_FROM_BOT")).toBe(true)
  })

  it("warns on conservative keyword in last relevant comment", () => {
    const issue = makeIssue({
      comments: makeComments({
        lastRelevantCommentBody: "This is a duplicate of #42",
      }),
    })
    const warnings = detectGhostWarnings(issue)
    expect(
      warnings.some((w) => w.code === "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD")
    ).toBe(true)
    expect(warnings.find((w) => w.matchedKeyword)?.matchedKeyword).toBe("duplicate of")
  })

  it("matches keywords case-insensitively", () => {
    const issue = makeIssue({
      comments: makeComments({
        lastRelevantCommentBody: "Closing As not needed",
      }),
    })
    const warnings = detectGhostWarnings(issue)
    expect(
      warnings.some((w) => w.code === "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD")
    ).toBe(true)
  })

  it("does not warn when lastRelevantCommentBody is null", () => {
    const issue = makeIssue({
      comments: makeComments({ lastRelevantCommentBody: null }),
    })
    const warnings = detectGhostWarnings(issue)
    expect(
      warnings.some((w) => w.code === "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD")
    ).toBe(false)
  })

  it("can return both warnings simultaneously", () => {
    const issue = makeIssue({
      comments: makeComments({
        lastCommentAuthorType: "bot",
        lastRelevantCommentBody: "won't fix this",
      }),
    })
    const warnings = detectGhostWarnings(issue)
    expect(warnings).toHaveLength(2)
  })
})

// === Soft Signals ===

describe("detectSoftSignals", () => {
  it("detects REPO_HAS_CONTRIBUTING_MD", () => {
    const signals = detectSoftSignals(makeContext({}, true), [])
    expect(signals.some((s) => s.code === "REPO_HAS_CONTRIBUTING_MD")).toBe(true)
  })

  it("does not detect REPO_HAS_CONTRIBUTING_MD when false", () => {
    const signals = detectSoftSignals(makeContext({}, false), [])
    expect(signals.some((s) => s.code === "REPO_HAS_CONTRIBUTING_MD")).toBe(false)
  })

  it("detects NO_GHOST_WARNING when warnings empty", () => {
    const signals = detectSoftSignals(makeContext(), [])
    expect(signals.some((s) => s.code === "NO_GHOST_WARNING")).toBe(true)
  })

  it("does not detect NO_GHOST_WARNING when warnings present", () => {
    const warnings: GhostWarning[] = [
      { code: "LAST_COMMENT_FROM_BOT", message: "bot" },
    ]
    const signals = detectSoftSignals(makeContext(), warnings)
    expect(signals.some((s) => s.code === "NO_GHOST_WARNING")).toBe(false)
  })

  it("detects RECENT_HUMAN_COMMENT within 90 days", () => {
    const ctx = makeContext({
      comments: makeComments({ lastHumanCommentAt: DAYS_AGO(30) }),
    })
    const signals = detectSoftSignals(ctx, [])
    expect(signals.some((s) => s.code === "RECENT_HUMAN_COMMENT")).toBe(true)
  })

  it("does not detect RECENT_HUMAN_COMMENT beyond 90 days", () => {
    const ctx = makeContext({
      comments: makeComments({ lastHumanCommentAt: DAYS_AGO(91) }),
    })
    const signals = detectSoftSignals(ctx, [])
    expect(signals.some((s) => s.code === "RECENT_HUMAN_COMMENT")).toBe(false)
  })

  it("does not detect RECENT_HUMAN_COMMENT when null", () => {
    const ctx = makeContext({
      comments: makeComments({ lastHumanCommentAt: null }),
    })
    const signals = detectSoftSignals(ctx, [])
    expect(signals.some((s) => s.code === "RECENT_HUMAN_COMMENT")).toBe(false)
  })

  it("detects STRUCTURED_OR_DESCRIPTIVE_BODY when true", () => {
    const ctx = makeContext({ hasStructuredBody: true })
    const signals = detectSoftSignals(ctx, [])
    expect(signals.some((s) => s.code === "STRUCTURED_OR_DESCRIPTIVE_BODY")).toBe(true)
  })

  it("does not detect STRUCTURED_OR_DESCRIPTIVE_BODY when false", () => {
    const ctx = makeContext({ hasStructuredBody: false })
    const signals = detectSoftSignals(ctx, [])
    expect(signals.some((s) => s.code === "STRUCTURED_OR_DESCRIPTIVE_BODY")).toBe(false)
  })
})

// === Why Selected ===

describe("buildWhySelected", () => {
  it("includes actionable label in text", () => {
    const result = buildWhySelected(makeIssue(), [], [])
    expect(result.text).toContain("labeled good first issue")
  })

  it("includes unassigned status", () => {
    const result = buildWhySelected(makeIssue(), [], [])
    expect(result.text).toContain("unassigned")
  })

  it("includes no linked open PR", () => {
    const result = buildWhySelected(makeIssue(), [], [])
    expect(result.text).toContain("no linked open PR")
  })

  it("includes signal summaries (max 2)", () => {
    const signals: SoftSignal[] = [
      { code: "REPO_HAS_CONTRIBUTING_MD", message: "m" },
      { code: "NO_GHOST_WARNING", message: "m" },
      { code: "RECENT_HUMAN_COMMENT", message: "m" },
    ]
    const result = buildWhySelected(makeIssue(), signals, [])
    expect(result.text).toContain("repo has CONTRIBUTING.md")
    expect(result.text).toContain("no ghost warning")
    expect(result.text).not.toContain("recent human comment")
  })

  it("includes bot warning summary", () => {
    const warnings: GhostWarning[] = [
      { code: "LAST_COMMENT_FROM_BOT", message: "bot" },
    ]
    const result = buildWhySelected(makeIssue(), [], warnings)
    expect(result.text).toContain("bot-last-comment warning")
  })

  it("includes keyword warning summary", () => {
    const warnings: GhostWarning[] = [
      {
        code: "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD",
        message: "kw",
        matchedKeyword: "closing as",
      },
    ]
    const result = buildWhySelected(makeIssue(), [], warnings)
    expect(result.text).toContain("keyword warning present")
  })

  it("joins parts with semicolons", () => {
    const result = buildWhySelected(makeIssue(), [], [])
    expect(result.text).toMatch(/; /)
  })
})
