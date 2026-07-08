import { describe, it, expect } from "vitest"

import { renderJson } from "../src/output/render-json.js"
import { renderTable } from "../src/output/render-table.js"
import { sanitizeForTerminal } from "../src/output/sanitize.js"
import type { ScanResult, EvaluatedIssue } from "../src/scan.js"
import type { NormalizedIssue, IssueCommentMeta } from "../src/domain/issue.js"
import type { GhostWarning, SoftSignal, WhySelectedResult } from "../src/domain/types.js"

// --- Helpers ---

const SCANNED_AT = "2026-04-14T00:00:00.000Z"
const UPDATED_AT = "2026-04-10T09:00:00.000Z"

function makeComments(overrides: Partial<IssueCommentMeta> = {}): IssueCommentMeta {
  return {
    totalCount: 0,
    lastCommentAuthorType: null,
    lastCommentBody: null,
    lastCommentCreatedAt: null,
    lastRelevantCommentBody: null,
    lastRelevantCommentCreatedAt: null,
    lastHumanCommentAt: null,
    ...overrides,
  }
}

function makeIssue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    repo: { owner: "acme", name: "widget" },
    number: 123,
    title: "Fix homepage typo",
    url: "https://github.com/acme/widget/issues/123",
    state: "open",
    labels: ["good first issue", "docs"],
    assigneeCount: 0,
    hasAssignee: false,
    linkedOpenPrCount: 0,
    updatedAt: UPDATED_AT,
    lastHumanActivityAt: UPDATED_AT,
    body: "Body text",
    hasStructuredBody: false,
    comments: makeComments(),
    ...overrides,
  }
}

function makeEvaluated(overrides: {
  readonly issue?: Partial<NormalizedIssue>
  readonly warnings?: readonly GhostWarning[]
  readonly signals?: readonly SoftSignal[]
  readonly whySelected?: WhySelectedResult
} = {}): EvaluatedIssue {
  return {
    issue: makeIssue(overrides.issue),
    warnings: overrides.warnings ?? [],
    signals: overrides.signals ?? [],
    whySelected: overrides.whySelected ?? { text: "has `good first issue` label" },
  }
}

function makeResult(evaluated: readonly EvaluatedIssue[] = []): ScanResult {
  return {
    repo: { owner: "acme", name: "widget" },
    evaluated,
    scannedAt: SCANNED_AT,
    stats: {
      totalFetched: evaluated.length + 5,
      passedFilters: evaluated.length,
      filteredOut: 5,
    },
  }
}

// === renderJson ===

describe("renderJson", () => {
  it("produces parseable JSON with empty issues for an empty result", () => {
    const out = renderJson(makeResult([]))
    const parsed = JSON.parse(out)

    expect(parsed).toEqual({
      repo: { owner: "acme", name: "widget" },
      scannedAt: SCANNED_AT,
      stats: { totalFetched: 5, passedFilters: 0, filteredOut: 5 },
      issues: [],
    })
  })

  it("projects one evaluated issue with required public fields only", () => {
    const result = makeResult([makeEvaluated()])
    const parsed = JSON.parse(renderJson(result))

    expect(parsed.issues).toHaveLength(1)
    const issue = parsed.issues[0]
    expect(issue).toEqual({
      number: 123,
      title: "Fix homepage typo",
      url: "https://github.com/acme/widget/issues/123",
      labels: ["good first issue", "docs"],
      updatedAt: UPDATED_AT,
      warnings: [],
      signals: [],
      whySelected: "has `good first issue` label",
    })
    // Internal fields are NOT leaked
    expect(issue).not.toHaveProperty("body")
    expect(issue).not.toHaveProperty("comments")
    expect(issue).not.toHaveProperty("hasStructuredBody")
    expect(issue).not.toHaveProperty("lastHumanActivityAt")
    expect(issue).not.toHaveProperty("repo")
  })

  it("includes warnings and signals with their codes and messages", () => {
    const warnings: GhostWarning[] = [
      {
        code: "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD",
        message: "Last relevant comment contains 'duplicate of'",
        matchedKeyword: "duplicate of",
      },
    ]
    const signals: SoftSignal[] = [
      { code: "REPO_HAS_CONTRIBUTING_MD", message: "Repository has CONTRIBUTING.md" },
      { code: "RECENT_HUMAN_COMMENT", message: "Recent human comment present" },
    ]
    const result = makeResult([makeEvaluated({ warnings, signals })])
    const parsed = JSON.parse(renderJson(result))

    expect(parsed.issues[0].warnings).toEqual([
      {
        code: "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD",
        message: "Last relevant comment contains 'duplicate of'",
        matchedKeyword: "duplicate of",
      },
    ])
    expect(parsed.issues[0].signals).toEqual([
      { code: "REPO_HAS_CONTRIBUTING_MD", message: "Repository has CONTRIBUTING.md" },
      { code: "RECENT_HUMAN_COMMENT", message: "Recent human comment present" },
    ])
  })

  it("omits matchedKeyword key when the warning has none", () => {
    const warnings: GhostWarning[] = [
      { code: "LAST_COMMENT_FROM_BOT", message: "Last comment is from a bot" },
    ]
    const result = makeResult([makeEvaluated({ warnings })])
    const parsed = JSON.parse(renderJson(result))

    expect(parsed.issues[0].warnings[0]).toEqual({
      code: "LAST_COMMENT_FROM_BOT",
      message: "Last comment is from a bot",
    })
    expect(parsed.issues[0].warnings[0]).not.toHaveProperty("matchedKeyword")
  })

  it("is deterministic for the same input", () => {
    const result = makeResult([makeEvaluated()])
    expect(renderJson(result)).toBe(renderJson(result))
  })

  it("emits pretty-printed JSON (2-space indent)", () => {
    const out = renderJson(makeResult([]))
    expect(out).toContain('\n  "repo":')
    expect(out).toContain('\n  "issues":')
  })
})

// === renderTable ===

describe("renderTable", () => {
  it("renders a header and empty marker when there are no issues", () => {
    const out = renderTable(makeResult([]))

    expect(out).toContain("gh-actionable scan — acme/widget")
    expect(out).toContain(`scanned: ${SCANNED_AT}`)
    expect(out).toContain("5 fetched, 0 selected, 5 filtered out")
    expect(out).toContain("no issues matched.")
  })

  it("renders each required field for one evaluated issue", () => {
    const out = renderTable(makeResult([makeEvaluated()]))

    expect(out).toContain("#123  Fix homepage typo")
    expect(out).toContain("labels:   good first issue, docs")
    expect(out).toContain(`updated:  ${UPDATED_AT}`)
    expect(out).toContain("warnings: (none)")
    expect(out).toContain("signals:  (none)")
    expect(out).toContain("why:      has `good first issue` label")
    expect(out).toContain("url:      https://github.com/acme/widget/issues/123")
  })

  it("renders warnings and signals joined by '; '", () => {
    const warnings: GhostWarning[] = [
      { code: "LAST_COMMENT_FROM_BOT", message: "Last comment is from a bot" },
    ]
    const signals: SoftSignal[] = [
      { code: "REPO_HAS_CONTRIBUTING_MD", message: "Repository has CONTRIBUTING.md" },
      { code: "RECENT_HUMAN_COMMENT", message: "Recent human comment present" },
    ]
    const out = renderTable(makeResult([makeEvaluated({ warnings, signals })]))

    expect(out).toContain("warnings: Last comment is from a bot")
    expect(out).toContain(
      "signals:  Repository has CONTRIBUTING.md; Recent human comment present"
    )
  })

  it("uses (none) for empty labels", () => {
    const out = renderTable(makeResult([makeEvaluated({ issue: { labels: [] } })]))
    expect(out).toContain("labels:   (none)")
  })

  it("separates multiple issues with a blank line and no trailing blank line", () => {
    const out = renderTable(
      makeResult([
        makeEvaluated({ issue: { number: 1, title: "First" } }),
        makeEvaluated({ issue: { number: 2, title: "Second" } }),
      ])
    )

    expect(out).toContain("#1  First")
    expect(out).toContain("#2  Second")
    expect(out.endsWith("\n")).toBe(false)
  })

  it("is deterministic for the same input", () => {
    const result = makeResult([makeEvaluated()])
    expect(renderTable(result)).toBe(renderTable(result))
  })

  it("strips ANSI, control, and bidi-override sequences from a hostile issue title", () => {
    const hostileTitle = "\x1B[31m\x1B[2J\r\x1B]0;pwn\x07\u202EFix homepage typo"
    const out = renderTable(makeResult([makeEvaluated({ issue: { title: hostileTitle } })]))

    expect(out).not.toMatch(/\x1B/)
    expect(out).not.toMatch(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/)
    expect(out).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
  })

  it("strips ANSI, control, and bidi-override sequences from a hostile label", () => {
    const hostileLabel = "\x1B[31m\x1B[2J\r\x1B]0;pwn\x07\u202Egood first issue"
    const out = renderTable(
      makeResult([makeEvaluated({ issue: { labels: [hostileLabel] } })])
    )

    expect(out).not.toMatch(/\x1B/)
    expect(out).not.toMatch(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/)
    expect(out).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
  })
})

// === sanitizeForTerminal ===

describe("sanitizeForTerminal", () => {
  it("preserves legitimate unicode (accents, emoji, em-dash, CJK) unchanged", () => {
    const text = "Fix caf\u00E9 bug \u{1F389} \u2014 \u4FEE\u5FA9\u95EE\u9898 \u00FCn\u00EFc\u00F6d\u00E9"
    expect(sanitizeForTerminal(text)).toBe(text)
  })
})
