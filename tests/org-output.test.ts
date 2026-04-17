import { describe, it, expect } from "vitest"

import { renderOrgTable } from "../src/output/render-org-table.js"
import { renderOrgJson } from "../src/output/render-org-json.js"
import type { OrgScanResult } from "../src/org-scan.js"
import type { EvaluatedIssue } from "../src/scan.js"
import type { NormalizedIssue, IssueCommentMeta } from "../src/domain/issue.js"

// --- Helpers ---

const SCANNED_AT = "2026-04-16T00:00:00.000Z"
const UPDATED_AT = "2026-04-10T09:00:00.000Z"

function makeComments(): IssueCommentMeta {
  return {
    totalCount: 0,
    lastCommentAuthorType: null,
    lastCommentBody: null,
    lastCommentCreatedAt: null,
    lastRelevantCommentBody: null,
    lastRelevantCommentCreatedAt: null,
    lastHumanCommentAt: null,
  }
}

function makeIssue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    repo: { owner: "acme", name: "widget" },
    number: 42,
    title: "Fix the widget",
    url: "https://github.com/acme/widget/issues/42",
    state: "open",
    labels: ["good first issue"],
    assigneeCount: 0,
    hasAssignee: false,
    linkedOpenPrCount: 0,
    updatedAt: UPDATED_AT,
    lastHumanActivityAt: UPDATED_AT,
    body: null,
    hasStructuredBody: false,
    comments: makeComments(),
    ...overrides,
  }
}

function makeEvaluated(overrides: Partial<NormalizedIssue> = {}): EvaluatedIssue {
  return {
    issue: makeIssue(overrides),
    warnings: [],
    signals: [],
    whySelected: { text: "has `good first issue` label" },
  }
}

function makeOrgResult(evaluated: readonly EvaluatedIssue[] = [], overrides: Partial<OrgScanResult> = {}): OrgScanResult {
  return {
    org: "acme",
    evaluated,
    scannedAt: SCANNED_AT,
    truncated: false,
    stats: {
      reposScanned: 3,
      reposWithResults: evaluated.length > 0 ? 1 : 0,
      reposFailed: 0,
      totalFetched: evaluated.length + 5,
      passedFilters: evaluated.length,
      filteredOut: 5,
    },
    repoErrors: [],
    ...overrides,
  }
}

// === renderOrgTable ===

describe("renderOrgTable", () => {
  it("renders org header and stats", () => {
    const out = renderOrgTable(makeOrgResult([]))

    expect(out).toContain("gh-actionable scan — org: acme")
    expect(out).toContain(`scanned: ${SCANNED_AT}`)
    expect(out).toContain("3 repos scanned")
    expect(out).toContain("no issues matched.")
  })

  it("renders truncation note when truncated is true", () => {
    const out = renderOrgTable(makeOrgResult([], { truncated: true }))
    expect(out).toContain("truncated")
  })

  it("does not render truncation note when truncated is false", () => {
    const out = renderOrgTable(makeOrgResult([]))
    expect(out).not.toContain("truncated")
  })

  it("renders issue block with repo label", () => {
    const out = renderOrgTable(makeOrgResult([makeEvaluated()]))

    expect(out).toContain("#42  Fix the widget  [acme/widget]")
    expect(out).toContain("labels:   good first issue")
    expect(out).toContain(`updated:  ${UPDATED_AT}`)
    expect(out).toContain("why:      has `good first issue` label")
    expect(out).toContain("url:      https://github.com/acme/widget/issues/42")
  })

  it("renders repo errors section when errors are present", () => {
    const result = makeOrgResult([], {
      repoErrors: [{ owner: "acme", name: "broken", message: "API error" }],
    })
    const out = renderOrgTable(result)

    expect(out).toContain("1 repo(s) failed")
    expect(out).toContain("acme/broken: API error")
  })

  it("is deterministic", () => {
    const result = makeOrgResult([makeEvaluated()])
    expect(renderOrgTable(result)).toBe(renderOrgTable(result))
  })
})

// === renderOrgJson ===

describe("renderOrgJson", () => {
  it("produces parseable JSON with correct top-level shape", () => {
    const parsed = JSON.parse(renderOrgJson(makeOrgResult([])))

    expect(parsed).toMatchObject({
      org: "acme",
      scannedAt: SCANNED_AT,
      truncated: false,
      issues: [],
      repoErrors: [],
    })
    expect(parsed.stats).toMatchObject({
      reposScanned: 3,
      reposWithResults: 0,
      reposFailed: 0,
    })
  })

  it("includes repo field on each issue", () => {
    const parsed = JSON.parse(renderOrgJson(makeOrgResult([makeEvaluated()])))

    expect(parsed.issues).toHaveLength(1)
    expect(parsed.issues[0].repo).toEqual({ owner: "acme", name: "widget" })
    expect(parsed.issues[0].number).toBe(42)
    expect(parsed.issues[0].title).toBe("Fix the widget")
  })

  it("includes repoErrors when present", () => {
    const result = makeOrgResult([], {
      repoErrors: [{ owner: "acme", name: "broken", message: "timeout" }],
    })
    const parsed = JSON.parse(renderOrgJson(result))

    expect(parsed.repoErrors).toEqual([
      { owner: "acme", name: "broken", message: "timeout" },
    ])
  })

  it("is deterministic", () => {
    const result = makeOrgResult([makeEvaluated()])
    expect(renderOrgJson(result)).toBe(renderOrgJson(result))
  })
})
