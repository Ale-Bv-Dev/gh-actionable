import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { scanWithCache } from "../src/cache/cache.js"
import type { CacheOptions } from "../src/cache/cache.js"
import type { ScanResult, EvaluatedIssue } from "../src/scan.js"

// --- Mock scanRepo ---

vi.mock("../src/scan.js", () => ({
  scanRepo: vi.fn(),
}))

import { scanRepo } from "../src/scan.js"

const mockScanRepo = vi.mocked(scanRepo)

// --- Helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FAKE_CLIENT = {} as any

const SCANNED_AT = "2026-04-16T14:00:00.000Z"

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    repo: { owner: "acme", name: "widget" },
    evaluated: [],
    scannedAt: SCANNED_AT,
    stats: { totalFetched: 0, passedFilters: 0, filteredOut: 0 },
    ...overrides,
  }
}

function makeEvaluatedIssueWithContent(): EvaluatedIssue {
  return {
    issue: {
      repo: { owner: "acme", name: "widget" },
      number: 42,
      title: "Fix the widget",
      url: "https://github.com/acme/widget/issues/42",
      state: "open",
      labels: ["good first issue"],
      assigneeCount: 0,
      hasAssignee: false,
      linkedOpenPrCount: 0,
      updatedAt: "2026-04-01T00:00:00.000Z",
      lastHumanActivityAt: "2026-04-01T00:00:00.000Z",
      body: "this is the issue body text",
      hasStructuredBody: true,
      comments: {
        totalCount: 1,
        lastCommentAuthorType: "user",
        lastCommentBody: "this is a comment body",
        lastCommentCreatedAt: "2026-03-20T00:00:00.000Z",
        lastRelevantCommentBody: "this is a relevant comment body",
        lastRelevantCommentCreatedAt: "2026-03-20T00:00:00.000Z",
        lastHumanCommentAt: "2026-03-20T00:00:00.000Z",
      },
    },
    warnings: [],
    signals: [],
    whySelected: { text: "has `good first issue` label" },
  }
}

async function writeFreshCache(
  cacheDir: string,
  owner: string,
  name: string,
  result: ScanResult,
  overrides: { version?: number; cachedAt?: string } = {}
): Promise<void> {
  const dir = join(cacheDir, owner.toLowerCase())
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `${name.toLowerCase()}.json`)
  const envelope = {
    version: overrides.version ?? 2,
    cachedAt: overrides.cachedAt ?? new Date().toISOString(),
    result,
  }
  await writeFile(filePath, JSON.stringify(envelope), "utf8")
}

// --- Tests ---

describe("scanWithCache", () => {
  let tmpDir: string
  let cacheOptions: CacheOptions

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-actionable-cache-test-"))
    cacheOptions = { cacheDir: tmpDir, ttlMs: 3_600_000 }
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("calls scanRepo and writes cache on a miss (no file)", async () => {
    const result = makeScanResult()
    mockScanRepo.mockResolvedValue(result)

    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).toHaveBeenCalledOnce()
    expect(returned).toEqual(result)

    // Cache file must have been written
    const filePath = join(tmpDir, "acme", "widget.json")
    const raw = await readFile(filePath, "utf8")
    const envelope = JSON.parse(raw) as { version: number; cachedAt: string; result: unknown }
    expect(envelope.version).toBe(2)
    // result on disk is stripped — empty evaluated is identical to the input
    expect(envelope.result).toEqual(result)
    expect(typeof envelope.cachedAt).toBe("string")
  })

  it("returns cached result and skips scanRepo on a fresh hit", async () => {
    const cached = makeScanResult({ scannedAt: "2026-04-16T13:00:00.000Z" })
    await writeFreshCache(tmpDir, "acme", "widget", cached)

    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).not.toHaveBeenCalled()
    expect(returned).toEqual(cached)
  })

  it("calls scanRepo when cache is expired", async () => {
    const staleResult = makeScanResult()
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    await writeFreshCache(tmpDir, "acme", "widget", staleResult, { cachedAt: twoHoursAgo })

    const freshResult = makeScanResult({ scannedAt: new Date().toISOString() })
    mockScanRepo.mockResolvedValue(freshResult)

    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).toHaveBeenCalledOnce()
    expect(returned).toEqual(freshResult)
  })

  it("calls scanRepo on corrupt JSON (non-fatal miss)", async () => {
    const dir = join(tmpDir, "acme")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "widget.json"), "not valid json {{{", "utf8")

    const result = makeScanResult()
    mockScanRepo.mockResolvedValue(result)

    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).toHaveBeenCalledOnce()
    expect(returned).toEqual(result)
  })

  it("calls scanRepo on invalid cachedAt (non-parseable date)", async () => {
    const dir = join(tmpDir, "acme")
    await mkdir(dir, { recursive: true })
    const envelope = { version: 1, cachedAt: "not-a-date", result: makeScanResult() }
    await writeFile(join(dir, "widget.json"), JSON.stringify(envelope), "utf8")

    const freshResult = makeScanResult({ scannedAt: new Date().toISOString() })
    mockScanRepo.mockResolvedValue(freshResult)

    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).toHaveBeenCalledOnce()
    expect(returned).toEqual(freshResult)
  })

  it("calls scanRepo on version mismatch", async () => {
    const oldResult = makeScanResult()
    await writeFreshCache(tmpDir, "acme", "widget", oldResult, { version: 99 })

    const freshResult = makeScanResult({ scannedAt: new Date().toISOString() })
    mockScanRepo.mockResolvedValue(freshResult)

    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).toHaveBeenCalledOnce()
    expect(returned).toEqual(freshResult)
  })

  it("normalizes owner and name to lowercase for cache path", async () => {
    const result = makeScanResult()
    mockScanRepo.mockResolvedValue(result)

    await scanWithCache(FAKE_CLIENT, { owner: "ACME", name: "Widget" }, cacheOptions)

    // File must be at lowercase path, not uppercase
    const expectedPath = join(tmpDir, "acme", "widget.json")
    const raw = await readFile(expectedPath, "utf8")
    expect(JSON.parse(raw)).toHaveProperty("version", 2)
  })

  it("uses short ttlMs to expire cache immediately in tests", async () => {
    const cached = makeScanResult()
    // Write cache as fresh, then read with ttlMs = 0 so it's already expired
    await writeFreshCache(tmpDir, "acme", "widget", cached)

    const freshResult = makeScanResult({ scannedAt: new Date().toISOString() })
    mockScanRepo.mockResolvedValue(freshResult)

    const returned = await scanWithCache(
      FAKE_CLIENT,
      { owner: "acme", name: "widget" },
      { cacheDir: tmpDir, ttlMs: 0 }
    )

    expect(mockScanRepo).toHaveBeenCalledOnce()
    expect(returned).toEqual(freshResult)
  })

  it("does not throw when write fails (non-writable path)", async () => {
    // Use a file path as if it were a directory to force write failure
    const blockerPath = join(tmpDir, "acme")
    // Write a file where the directory should be, so mkdir/writeFile will fail
    await writeFile(blockerPath, "blocker", "utf8")

    const result = makeScanResult()
    mockScanRepo.mockResolvedValue(result)

    // Must not throw — write error is silenced
    await expect(
      scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)
    ).resolves.toEqual(result)

    expect(mockScanRepo).toHaveBeenCalledOnce()
  })

  // --- Cache privacy ---

  it("does not write body or comment text to the cache file", async () => {
    const result = makeScanResult({ evaluated: [makeEvaluatedIssueWithContent()] })
    mockScanRepo.mockResolvedValue(result)

    await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    const filePath = join(tmpDir, "acme", "widget.json")
    const raw = await readFile(filePath, "utf8")
    expect(raw).not.toContain("this is the issue body text")
    expect(raw).not.toContain("this is a comment body")
    expect(raw).not.toContain("this is a relevant comment body")
  })

  it("returns null body and stripped comment fields when reading from cache", async () => {
    const result = makeScanResult({ evaluated: [makeEvaluatedIssueWithContent()] })
    mockScanRepo.mockResolvedValue(result)

    // First call: miss — writes stripped cache, returns live result directly
    await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    // Second call: hit — returns fromStripped reconstruction
    mockScanRepo.mockClear()
    const returned = await scanWithCache(FAKE_CLIENT, { owner: "acme", name: "widget" }, cacheOptions)

    expect(mockScanRepo).not.toHaveBeenCalled()

    const cachedIssue = returned.evaluated[0].issue
    // Private fields stripped
    expect(cachedIssue.body).toBeNull()
    expect(cachedIssue.comments.lastCommentBody).toBeNull()
    expect(cachedIssue.comments.lastRelevantCommentBody).toBeNull()
    expect(cachedIssue.comments.lastCommentAuthorType).toBeNull()
    // Output-relevant fields preserved
    expect(cachedIssue.number).toBe(42)
    expect(cachedIssue.title).toBe("Fix the widget")
    expect(cachedIssue.url).toBe("https://github.com/acme/widget/issues/42")
    expect(cachedIssue.labels).toEqual(["good first issue"])
    expect(cachedIssue.updatedAt).toBe("2026-04-01T00:00:00.000Z")
  })
})
