import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import type { Octokit } from "@octokit/rest"

import { scanRepo } from "../scan.js"
import type { ScanResult, ScanRepoOptions } from "../scan.js"
import type { GhostWarning, SoftSignal, WhySelectedResult } from "../domain/types.js"

// --- Constants ---

// v2: stores a stripped CachedScanResult — no issue body, no comment text.
// Files written by v1 are treated as misses and re-fetched.
const CACHE_VERSION = 2
const DEFAULT_TTL_MS = 3_600_000 // 1 hour
const DEFAULT_CACHE_DIR = join(homedir(), ".cache", "gh-actionable")

// --- Public types ---

export interface CacheOptions {
  readonly cacheDir?: string
  readonly ttlMs?: number
}

// --- Cache-internal stripped types ---
// Only the fields needed by renderers and scanOrg are persisted.
// issue.body, issue.comments.* text, and evaluation-only fields are not stored.

interface CachedIssue {
  readonly repo: { readonly owner: string; readonly name: string }
  readonly number: number
  readonly title: string
  readonly url: string
  readonly labels: readonly string[]
  readonly updatedAt: string
}

interface CachedEvaluatedIssue {
  readonly issue: CachedIssue
  readonly warnings: readonly GhostWarning[]
  readonly signals: readonly SoftSignal[]
  readonly whySelected: WhySelectedResult
}

interface CachedScanResult {
  readonly repo: { readonly owner: string; readonly name: string }
  readonly evaluated: readonly CachedEvaluatedIssue[]
  readonly scannedAt: string
  readonly stats: {
    readonly totalFetched: number
    readonly passedFilters: number
    readonly filteredOut: number
  }
}

interface CacheEnvelope {
  readonly version: number
  readonly cachedAt: string
  readonly result: CachedScanResult
}

// --- Projection: ScanResult → CachedScanResult (strips private fields) ---

function toStripped(result: ScanResult): CachedScanResult {
  return {
    repo: result.repo,
    scannedAt: result.scannedAt,
    stats: result.stats,
    evaluated: result.evaluated.map((e) => ({
      issue: {
        repo: e.issue.repo,
        number: e.issue.number,
        title: e.issue.title,
        url: e.issue.url,
        labels: e.issue.labels,
        updatedAt: e.issue.updatedAt,
      },
      warnings: e.warnings,
      signals: e.signals,
      whySelected: e.whySelected,
    })),
  }
}

// --- Reconstruction: CachedScanResult → ScanResult ---
// Stripped fields are restored with zero values.
// These fields are only meaningful during evaluation, which has already run.

function fromStripped(cached: CachedScanResult): ScanResult {
  return {
    repo: cached.repo,
    scannedAt: cached.scannedAt,
    stats: cached.stats,
    evaluated: cached.evaluated.map((e) => ({
      issue: {
        ...e.issue,
        state: "open" as const,
        assigneeCount: 0,
        hasAssignee: false,
        linkedOpenPrCount: 0,
        lastHumanActivityAt: null,
        body: null,
        hasStructuredBody: false,
        comments: {
          totalCount: 0,
          lastCommentAuthorType: null,
          lastCommentBody: null,
          lastCommentCreatedAt: null,
          lastRelevantCommentBody: null,
          lastRelevantCommentCreatedAt: null,
          lastHumanCommentAt: null,
        },
      },
      warnings: e.warnings,
      signals: e.signals,
      whySelected: e.whySelected,
    })),
  }
}

// --- Internal helpers ---

function cacheFilePath(owner: string, name: string, cacheDir: string): string {
  return join(cacheDir, owner.toLowerCase(), `${name.toLowerCase()}.json`)
}

async function readCacheFile(filePath: string, ttlMs: number): Promise<ScanResult | null> {
  try {
    const raw = await readFile(filePath, "utf8")
    const parsed: unknown = JSON.parse(raw)

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("cachedAt" in parsed) ||
      !("result" in parsed)
    ) {
      return null
    }

    const envelope = parsed as CacheEnvelope

    if (envelope.version !== CACHE_VERSION) {
      return null
    }

    const cachedAtMs = new Date(envelope.cachedAt).getTime()
    if (isNaN(cachedAtMs)) {
      return null
    }

    const ageMs = Date.now() - cachedAtMs
    if (ageMs >= ttlMs) {
      return null
    }

    return fromStripped(envelope.result)
  } catch {
    return null
  }
}

async function writeCacheFile(filePath: string, result: ScanResult): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    const envelope: CacheEnvelope = {
      version: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      result: toStripped(result),
    }
    await writeFile(filePath, JSON.stringify(envelope, null, 2), "utf8")
  } catch {
    // Write failures are non-fatal. The scan result is still returned.
  }
}

// --- Public API ---

export async function scanWithCache(
  client: Octokit,
  options: ScanRepoOptions,
  cacheOptions?: CacheOptions
): Promise<ScanResult> {
  const cacheDir = cacheOptions?.cacheDir ?? DEFAULT_CACHE_DIR
  const ttlMs = cacheOptions?.ttlMs ?? DEFAULT_TTL_MS
  const filePath = cacheFilePath(options.owner, options.name, cacheDir)

  const cached = await readCacheFile(filePath, ttlMs)
  if (cached !== null) {
    return cached
  }

  const result = await scanRepo(client, options)
  await writeCacheFile(filePath, result)
  return result
}
