import { describe, it, expect, vi, beforeEach } from "vitest"

import { scanRepo } from "../src/scan.js"
import type { ScanRepoOptions } from "../src/scan.js"
import type { RawGitHubIssue } from "../src/github/fetch.js"
import type { GitHubCommentSummary } from "../src/github/types.js"

// --- Mock the fetch module ---

vi.mock("../src/github/fetch.js", () => ({
  fetchIssuesForRepo: vi.fn(),
  fetchIssueComments: vi.fn(),
  fetchLinkedPullRequests: vi.fn(),
  checkContributingMd: vi.fn(),
  classifyRawAuthorType: vi.fn((user: { login: string; type: string } | null | undefined) => {
    if (!user) return "unknown"
    if (user.type === "Bot" || user.login.endsWith("[bot]")) return "bot"
    return "user"
  }),
}))

import {
  fetchIssuesForRepo,
  fetchIssueComments,
  fetchLinkedPullRequests,
  checkContributingMd,
} from "../src/github/fetch.js"

const mockFetchIssues = vi.mocked(fetchIssuesForRepo)
const mockFetchComments = vi.mocked(fetchIssueComments)
const mockFetchLinkedPrs = vi.mocked(fetchLinkedPullRequests)
const mockCheckContributing = vi.mocked(checkContributingMd)

// --- Constants ---

const NOW = new Date("2026-04-14T00:00:00Z")
const DAYS_AGO = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const OPTIONS: ScanRepoOptions = { owner: "test", name: "repo", now: NOW }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FAKE_CLIENT = {} as any

// --- Helpers ---

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
    comments: 1,
    updated_at: DAYS_AGO(5),
    created_at: DAYS_AGO(30),
    ...overrides,
  }
}

function makeComment(overrides: Partial<GitHubCommentSummary> = {}): GitHubCommentSummary {
  return {
    authorLogin: "bob",
    authorType: "user",
    body: "I can help with this",
    createdAt: DAYS_AGO(3),
    ...overrides,
  }
}

function setupDefaultMocks(issues: readonly RawGitHubIssue[] = [makeRawIssue()]) {
  // Both label fetches return the same set (simulates issue having both labels)
  mockFetchIssues.mockResolvedValue(issues)
  mockFetchComments.mockResolvedValue([makeComment()])
  mockFetchLinkedPrs.mockResolvedValue([])
  mockCheckContributing.mockResolvedValue(false)
}

function makeFullPage(startNumber: number): RawGitHubIssue[] {
  return Array.from({ length: 100 }, (_, i) => makeRawIssue({ number: startNumber + i }))
}

function setupPaginatedMock(
  pages: Record<string, readonly (readonly RawGitHubIssue[])[]>
) {
  mockFetchIssues.mockImplementation(async (_client, _owner, _repo, options) => {
    const labelPages = pages[options.labels] ?? []
    const pageIndex = (options.page ?? 1) - 1
    return labelPages[pageIndex] ?? []
  })
  mockFetchComments.mockResolvedValue([makeComment()])
  mockFetchLinkedPrs.mockResolvedValue([])
  mockCheckContributing.mockResolvedValue(false)
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks()
})

describe("scanRepo", () => {

  // === Fetch orchestration ===

  it("fetches two candidate sets with separate label queries", async () => {
    setupDefaultMocks()

    await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(mockFetchIssues).toHaveBeenCalledTimes(2)

    const firstCall = mockFetchIssues.mock.calls[0]
    expect(firstCall[3]).toMatchObject({ labels: "good first issue", state: "open" })

    const secondCall = mockFetchIssues.mock.calls[1]
    expect(secondCall[3]).toMatchObject({ labels: "help wanted", state: "open" })
  })

  it("checks CONTRIBUTING.md once per repo", async () => {
    setupDefaultMocks()

    await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(mockCheckContributing).toHaveBeenCalledTimes(1)
    expect(mockCheckContributing).toHaveBeenCalledWith(FAKE_CLIENT, "test", "repo")
  })

  it("fetches comments and linked PRs for each candidate", async () => {
    const issues = [
      makeRawIssue({ number: 1 }),
      makeRawIssue({ number: 2 }),
    ]
    // First label fetch returns both, second returns empty (no overlap)
    mockFetchIssues
      .mockResolvedValueOnce(issues)
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(mockFetchComments).toHaveBeenCalledTimes(2)
    expect(mockFetchLinkedPrs).toHaveBeenCalledTimes(2)
  })

  // === Deduplication ===

  it("deduplicates issues appearing in both label fetches", async () => {
    const issue = makeRawIssue({ number: 10 })
    // Same issue returned by both queries
    mockFetchIssues
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([issue])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    // Should only be enriched once
    expect(mockFetchComments).toHaveBeenCalledTimes(1)
    expect(result.stats.totalFetched).toBe(1)
  })

  // === Hard filter exclusion ===

  it("excludes issues that fail hard filters", async () => {
    const staleIssue = makeRawIssue({
      number: 99,
      updated_at: DAYS_AGO(200),
      created_at: DAYS_AGO(200),
    })
    // Issue author is human but created_at is >90 days ago → stale
    mockFetchIssues
      .mockResolvedValueOnce([staleIssue])
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([]) // no comments → lastHumanActivityAt from created_at only
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(0)
    expect(result.stats.totalFetched).toBe(1)
    expect(result.stats.filteredOut).toBe(1)
    expect(result.stats.passedFilters).toBe(0)
  })

  it("excludes issues with assignees", async () => {
    const assignedIssue = makeRawIssue({ number: 5, assignees: [{}] })
    mockFetchIssues
      .mockResolvedValueOnce([assignedIssue])
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(0)
    expect(result.stats.filteredOut).toBe(1)
  })

  it("excludes issues with linked open PRs", async () => {
    mockFetchIssues
      .mockResolvedValueOnce([makeRawIssue({ number: 7 })])
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([
      { number: 100, isOpen: true, url: "https://github.com/test/repo/pull/100" },
    ])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(0)
    expect(result.stats.filteredOut).toBe(1)
  })

  // === Happy path evaluation ===

  it("returns evaluated issues with warnings, signals, and whySelected", async () => {
    setupDefaultMocks()

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(1)

    const first = result.evaluated[0]
    expect(first.issue.number).toBe(42)
    expect(first.warnings).toBeDefined()
    expect(first.signals).toBeDefined()
    expect(first.whySelected.text).toBeTruthy()
  })

  it("includes CONTRIBUTING.md signal when present", async () => {
    setupDefaultMocks()
    mockCheckContributing.mockResolvedValue(true)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    const signals = result.evaluated[0].signals
    expect(signals.some((s) => s.code === "REPO_HAS_CONTRIBUTING_MD")).toBe(true)
  })

  it("does not include CONTRIBUTING.md signal when absent", async () => {
    setupDefaultMocks()
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    const signals = result.evaluated[0].signals
    expect(signals.some((s) => s.code === "REPO_HAS_CONTRIBUTING_MD")).toBe(false)
  })

  it("detects ghost warnings on evaluated issues", async () => {
    // Last comment from a bot triggers LAST_COMMENT_FROM_BOT warning
    mockFetchIssues
      .mockResolvedValueOnce([makeRawIssue()])
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([
      makeComment({ authorType: "bot", authorLogin: "dependabot[bot]", createdAt: DAYS_AGO(1) }),
      makeComment({ authorType: "user", createdAt: DAYS_AGO(5) }),
    ])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(1)
    expect(result.evaluated[0].warnings.some((w) => w.code === "LAST_COMMENT_FROM_BOT")).toBe(true)
  })

  // === Sorting ===

  it("sorts evaluated issues by updatedAt descending", async () => {
    const older = makeRawIssue({ number: 1, updated_at: DAYS_AGO(10), created_at: DAYS_AGO(30) })
    const newer = makeRawIssue({ number: 2, updated_at: DAYS_AGO(2), created_at: DAYS_AGO(15) })

    mockFetchIssues
      .mockResolvedValueOnce([older, newer])
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(2)
    expect(result.evaluated[0].issue.number).toBe(2) // newer first
    expect(result.evaluated[1].issue.number).toBe(1) // older second
  })

  // === Stats ===

  it("computes stats after deduplication", async () => {
    const passing = makeRawIssue({ number: 1 })
    const assigned = makeRawIssue({ number: 2, assignees: [{}] })
    const duplicate = makeRawIssue({ number: 1 }) // same as passing

    mockFetchIssues
      .mockResolvedValueOnce([passing, assigned])
      .mockResolvedValueOnce([duplicate])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    // 2 unique issues (1 and 2), not 3
    expect(result.stats.totalFetched).toBe(2)
    expect(result.stats.passedFilters).toBe(1)
    expect(result.stats.filteredOut).toBe(1)
  })

  // === Result metadata ===

  it("includes repo and scannedAt in result", async () => {
    setupDefaultMocks()

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.repo).toEqual({ owner: "test", name: "repo" })
    expect(result.scannedAt).toBe("2026-04-14T00:00:00.000Z")
  })

  // === Empty results ===

  it("returns empty evaluated list when no candidates and skips CONTRIBUTING.md check", async () => {
    mockFetchIssues.mockResolvedValue([])

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(0)
    expect(result.stats.totalFetched).toBe(0)
    expect(result.stats.passedFilters).toBe(0)
    expect(result.stats.filteredOut).toBe(0)
    expect(mockCheckContributing).not.toHaveBeenCalled()
  })

  it("returns empty evaluated list when all candidates are filtered out", async () => {
    // All issues have assignees
    const issues = [
      makeRawIssue({ number: 1, assignees: [{}] }),
      makeRawIssue({ number: 2, assignees: [{}] }),
    ]
    mockFetchIssues
      .mockResolvedValueOnce(issues)
      .mockResolvedValueOnce([])
    mockFetchComments.mockResolvedValue([makeComment()])
    mockFetchLinkedPrs.mockResolvedValue([])
    mockCheckContributing.mockResolvedValue(false)

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(0)
    expect(result.stats.totalFetched).toBe(2)
    expect(result.stats.filteredOut).toBe(2)
  })

  // === Pagination ===

  it("stops fetching pages for a label when a page returns fewer than perPage items", async () => {
    setupPaginatedMock({
      "good first issue": [[makeRawIssue({ number: 1 })]], // 1 < 100 → stop
      "help wanted": [[]],                                  // 0 < 100 → stop
    })

    await scanRepo(FAKE_CLIENT, OPTIONS)

    // 1 call per label = 2 total
    expect(mockFetchIssues).toHaveBeenCalledTimes(2)
  })

  it("fetches multiple pages for a label until a partial page is returned", async () => {
    setupPaginatedMock({
      "good first issue": [
        makeFullPage(1),                          // 100 → continue
        makeFullPage(101).slice(0, 50),           // 50 < 100 → stop
      ],
      "help wanted": [[]],
    })

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    // good first issue: page 1 + page 2; help wanted: page 1 → 3 calls
    expect(mockFetchIssues).toHaveBeenCalledTimes(3)
    expect(result.stats.totalFetched).toBe(150)
  })

  it("stops at the 10-page safety cap even if pages keep returning full results", async () => {
    // 12 full pages available — loop must cap at 10
    setupPaginatedMock({
      "good first issue": Array.from({ length: 12 }, (_, i) => makeFullPage(1 + i * 100)),
      "help wanted": [[]],
    })

    await scanRepo(FAKE_CLIENT, OPTIONS)

    const goodFirstCalls = mockFetchIssues.mock.calls.filter(
      (call) => (call[3] as { labels: string }).labels === "good first issue"
    )
    expect(goodFirstCalls).toHaveLength(10)
  })

  it("deduplicates within a label across pages", async () => {
    // Page 1: #1..#100 (full); Page 2: #95..#144 (50 items, 6 overlap with page 1)
    const page1 = makeFullPage(1)
    const page2 = Array.from({ length: 50 }, (_, i) => makeRawIssue({ number: 95 + i }))

    setupPaginatedMock({
      "good first issue": [page1, page2],
      "help wanted": [[]],
    })

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    // 100 from page 1 + 44 new from page 2 (#101..#144) = 144 unique
    expect(result.stats.totalFetched).toBe(144)
  })

  it("computes stats correctly after both per-label and cross-label deduplication", async () => {
    // good first issue page 1: #1..#100
    // good first issue page 2: #91..#140 (10 overlap with page 1, 40 new)
    // help wanted page 1: #116..#165 (25 overlap with good first, 25 new)
    // Expected unique total: 100 + 40 + 25 = 165
    const goodFirstPage1 = makeFullPage(1)
    const goodFirstPage2 = Array.from({ length: 50 }, (_, i) => makeRawIssue({ number: 91 + i }))
    const helpWantedPage1 = Array.from({ length: 50 }, (_, i) => makeRawIssue({ number: 116 + i }))

    setupPaginatedMock({
      "good first issue": [goodFirstPage1, goodFirstPage2],
      "help wanted": [helpWantedPage1],
    })

    const result = await scanRepo(FAKE_CLIENT, OPTIONS)

    expect(result.stats.totalFetched).toBe(165)
  })
})
