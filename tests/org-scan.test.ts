import { describe, it, expect, vi, beforeEach } from "vitest"

import { scanOrg } from "../src/org-scan.js"
import type { ScanOrgOptions } from "../src/org-scan.js"
import type { OrgRepoInfo } from "../src/github/fetch.js"
import type { ScanResult } from "../src/scan.js"
import type { NormalizedIssue, IssueCommentMeta } from "../src/domain/issue.js"
import type { EvaluatedIssue } from "../src/scan.js"

// --- Mocks ---

vi.mock("../src/github/fetch.js", () => ({
  fetchOrgRepositories: vi.fn(),
  // preserve other fetch exports as no-ops so imports don't break
  fetchIssuesForRepo: vi.fn(),
  fetchIssueComments: vi.fn(),
  fetchLinkedPullRequests: vi.fn(),
  checkContributingMd: vi.fn(),
  classifyRawAuthorType: vi.fn(),
}))

vi.mock("../src/cache/cache.js", () => ({
  scanWithCache: vi.fn(),
}))

import { fetchOrgRepositories } from "../src/github/fetch.js"
import { scanWithCache } from "../src/cache/cache.js"

const mockFetchOrgRepos = vi.mocked(fetchOrgRepositories)
const mockScanWithCache = vi.mocked(scanWithCache)

// --- Constants ---

const NOW = new Date("2026-04-16T00:00:00Z")
const DAYS_AGO = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const OPTIONS: ScanOrgOptions = { org: "acme", now: NOW }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FAKE_CLIENT = {} as any

// --- Helpers ---

function makeRepo(name: string, owner = "acme"): OrgRepoInfo {
  return { owner, name }
}

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

function makeIssue(
  number: number,
  owner: string,
  repo: string,
  updatedAt: string
): NormalizedIssue {
  return {
    repo: { owner, name: repo },
    number,
    title: `Issue ${number}`,
    url: `https://github.com/${owner}/${repo}/issues/${number}`,
    state: "open",
    labels: ["good first issue"],
    assigneeCount: 0,
    hasAssignee: false,
    linkedOpenPrCount: 0,
    updatedAt,
    lastHumanActivityAt: updatedAt,
    body: null,
    hasStructuredBody: false,
    comments: makeComments(),
  }
}

function makeEvaluated(number: number, owner: string, repo: string, updatedAt: string): EvaluatedIssue {
  return {
    issue: makeIssue(number, owner, repo, updatedAt),
    warnings: [],
    signals: [],
    whySelected: { text: "has `good first issue` label" },
  }
}

function makeScanResult(
  owner: string,
  repo: string,
  evaluated: EvaluatedIssue[],
  totalFetched = evaluated.length + 2
): ScanResult {
  return {
    repo: { owner, name: repo },
    evaluated,
    scannedAt: NOW.toISOString(),
    stats: {
      totalFetched,
      passedFilters: evaluated.length,
      filteredOut: totalFetched - evaluated.length,
    },
  }
}

// --- Tests ---

describe("scanOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls scanWithCache once per repo returned by fetchOrgRepositories", async () => {
    const repos = [makeRepo("alpha"), makeRepo("beta"), makeRepo("gamma")]
    mockFetchOrgRepos.mockResolvedValue(repos)
    mockScanWithCache.mockResolvedValue(makeScanResult("acme", "alpha", []))

    await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(mockScanWithCache).toHaveBeenCalledTimes(3)
    expect(mockScanWithCache).toHaveBeenCalledWith(FAKE_CLIENT, { owner: "acme", name: "alpha", now: NOW })
    expect(mockScanWithCache).toHaveBeenCalledWith(FAKE_CLIENT, { owner: "acme", name: "beta", now: NOW })
    expect(mockScanWithCache).toHaveBeenCalledWith(FAKE_CLIENT, { owner: "acme", name: "gamma", now: NOW })
  })

  it("truncates to MAX_ORG_REPOS (100) and sets truncated: true", async () => {
    const repos = Array.from({ length: 105 }, (_, i) => makeRepo(`repo-${i}`))
    mockFetchOrgRepos.mockResolvedValue(repos)
    mockScanWithCache.mockResolvedValue(makeScanResult("acme", "repo-0", []))

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(mockScanWithCache).toHaveBeenCalledTimes(100)
    expect(result.truncated).toBe(true)
  })

  it("sets truncated: false when repos are within limit", async () => {
    mockFetchOrgRepos.mockResolvedValue([makeRepo("alpha"), makeRepo("beta")])
    mockScanWithCache.mockResolvedValue(makeScanResult("acme", "alpha", []))

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(result.truncated).toBe(false)
  })

  it("collects repo error and continues scanning remaining repos when one fails", async () => {
    mockFetchOrgRepos.mockResolvedValue([makeRepo("alpha"), makeRepo("beta"), makeRepo("gamma")])
    mockScanWithCache
      .mockResolvedValueOnce(makeScanResult("acme", "alpha", []))
      .mockRejectedValueOnce(new Error("API rate limit"))
      .mockResolvedValueOnce(makeScanResult("acme", "gamma", []))

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(mockScanWithCache).toHaveBeenCalledTimes(3)
    expect(result.repoErrors).toHaveLength(1)
    expect(result.repoErrors[0]).toEqual({
      owner: "acme",
      name: "beta",
      message: "API rate limit",
    })
    expect(result.stats.reposFailed).toBe(1)
    expect(result.stats.reposScanned).toBe(2)
  })

  it("aggregates stats across repos", async () => {
    const e1 = makeEvaluated(1, "acme", "alpha", DAYS_AGO(1))
    const e2 = makeEvaluated(2, "acme", "beta", DAYS_AGO(2))
    mockFetchOrgRepos.mockResolvedValue([makeRepo("alpha"), makeRepo("beta")])
    mockScanWithCache
      .mockResolvedValueOnce(makeScanResult("acme", "alpha", [e1], 10))
      .mockResolvedValueOnce(makeScanResult("acme", "beta", [e2], 5))

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(result.stats.totalFetched).toBe(15)
    expect(result.stats.passedFilters).toBe(2)
    expect(result.stats.filteredOut).toBe(13)
    expect(result.stats.reposScanned).toBe(2)
    expect(result.stats.reposWithResults).toBe(2)
  })

  it("sorts all evaluated issues globally by updatedAt descending", async () => {
    const old = makeEvaluated(1, "acme", "alpha", DAYS_AGO(10))
    const mid = makeEvaluated(2, "acme", "beta", DAYS_AGO(5))
    const recent = makeEvaluated(3, "acme", "alpha", DAYS_AGO(1))

    mockFetchOrgRepos.mockResolvedValue([makeRepo("alpha"), makeRepo("beta")])
    // alpha returns old+recent (out of order), beta returns mid
    mockScanWithCache
      .mockResolvedValueOnce(makeScanResult("acme", "alpha", [old, recent], 5))
      .mockResolvedValueOnce(makeScanResult("acme", "beta", [mid], 3))

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(3)
    expect(result.evaluated[0].issue.number).toBe(3) // most recent
    expect(result.evaluated[1].issue.number).toBe(2)
    expect(result.evaluated[2].issue.number).toBe(1) // oldest
  })

  it("returns empty evaluated and zero stats when no repos are returned", async () => {
    mockFetchOrgRepos.mockResolvedValue([])

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(result.evaluated).toHaveLength(0)
    expect(mockScanWithCache).not.toHaveBeenCalled()
    expect(result.stats.reposScanned).toBe(0)
    expect(result.stats.totalFetched).toBe(0)
    expect(result.truncated).toBe(false)
  })

  it("counts reposWithResults only for repos that contributed at least one issue", async () => {
    const e1 = makeEvaluated(1, "acme", "alpha", DAYS_AGO(1))
    mockFetchOrgRepos.mockResolvedValue([makeRepo("alpha"), makeRepo("beta")])
    mockScanWithCache
      .mockResolvedValueOnce(makeScanResult("acme", "alpha", [e1], 5))
      .mockResolvedValueOnce(makeScanResult("acme", "beta", [], 3))

    const result = await scanOrg(FAKE_CLIENT, OPTIONS)

    expect(result.stats.reposWithResults).toBe(1)
    expect(result.stats.reposScanned).toBe(2)
  })
})
