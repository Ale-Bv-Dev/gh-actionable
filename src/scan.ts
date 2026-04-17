import type { Octokit } from "@octokit/rest"

import type { NormalizedIssue, RepoRef } from "./domain/issue.js"
import type { GhostWarning, SoftSignal, WhySelectedResult } from "./domain/types.js"
import { evaluateHardFilters } from "./domain/filters.js"
import { detectGhostWarnings } from "./domain/warnings.js"
import { detectSoftSignals } from "./domain/signals.js"
import { buildWhySelected } from "./domain/why-selected.js"
import {
  fetchIssuesForRepo,
  fetchIssueComments,
  fetchLinkedPullRequests,
  checkContributingMd,
} from "./github/fetch.js"
import type { RawGitHubIssue } from "./github/fetch.js"
import { normalizeIssue } from "./github/normalize.js"

// --- Types ---

export interface ScanRepoOptions {
  readonly owner: string
  readonly name: string
  readonly now?: Date
}

export interface EvaluatedIssue {
  readonly issue: NormalizedIssue
  readonly warnings: readonly GhostWarning[]
  readonly signals: readonly SoftSignal[]
  readonly whySelected: WhySelectedResult
}

export interface ScanStats {
  readonly totalFetched: number
  readonly passedFilters: number
  readonly filteredOut: number
}

export interface ScanResult {
  readonly repo: RepoRef
  readonly evaluated: readonly EvaluatedIssue[]
  readonly scannedAt: string
  readonly stats: ScanStats
}

// --- Orchestrator ---

export async function scanRepo(
  client: Octokit,
  options: ScanRepoOptions
): Promise<ScanResult> {
  const { owner, name } = options
  const now = options.now ?? new Date()
  const repo: RepoRef = { owner, name }

  // Fetch two candidate sets (OR semantics) and deduplicate
  const candidates = await fetchCandidateIssues(client, owner, name)

  // Early return if no candidates — skip CONTRIBUTING.md check
  if (candidates.length === 0) {
    return {
      repo,
      evaluated: [],
      scannedAt: now.toISOString(),
      stats: { totalFetched: 0, passedFilters: 0, filteredOut: 0 },
    }
  }

  // Check CONTRIBUTING.md once per repo
  const repoHasContributingMd = await checkContributingMd(client, owner, name)

  // Enrich, normalize, evaluate each candidate
  const evaluated: EvaluatedIssue[] = []

  for (const raw of candidates) {
    const comments = await fetchIssueComments(client, owner, name, raw.number)
    const linkedPrs = await fetchLinkedPullRequests(client, owner, name, raw.number)
    const normalized = normalizeIssue(raw, comments, linkedPrs, repo)

    const filterResult = evaluateHardFilters({ issue: normalized, repoHasContributingMd, now })

    if (!filterResult.passed) {
      continue
    }

    const warnings = detectGhostWarnings(normalized)
    const signals = detectSoftSignals({ issue: normalized, repoHasContributingMd, now }, warnings)
    const whySelected = buildWhySelected(normalized, signals, warnings)

    evaluated.push({ issue: normalized, warnings, signals, whySelected })
  }

  // Sort by updatedAt descending
  evaluated.sort((a, b) => {
    return new Date(b.issue.updatedAt).getTime() - new Date(a.issue.updatedAt).getTime()
  })

  return {
    repo,
    evaluated,
    scannedAt: now.toISOString(),
    stats: {
      totalFetched: candidates.length,
      passedFilters: evaluated.length,
      filteredOut: candidates.length - evaluated.length,
    },
  }
}

// --- Internal helpers ---

const PER_PAGE = 100
const MAX_PAGES_PER_LABEL = 10

async function fetchCandidateIssues(
  client: Octokit,
  owner: string,
  repo: string
): Promise<readonly RawGitHubIssue[]> {
  const [goodFirstIssues, helpWantedIssues] = await Promise.all([
    fetchAllPagesForLabel(client, owner, repo, "good first issue"),
    fetchAllPagesForLabel(client, owner, repo, "help wanted"),
  ])

  // Cross-label deduplication by issue number
  const seen = new Set<number>()
  const deduped: RawGitHubIssue[] = []

  for (const issue of goodFirstIssues) {
    if (!seen.has(issue.number)) {
      seen.add(issue.number)
      deduped.push(issue)
    }
  }

  for (const issue of helpWantedIssues) {
    if (!seen.has(issue.number)) {
      seen.add(issue.number)
      deduped.push(issue)
    }
  }

  return deduped
}

async function fetchAllPagesForLabel(
  client: Octokit,
  owner: string,
  repo: string,
  label: string
): Promise<readonly RawGitHubIssue[]> {
  const seen = new Set<number>()
  const collected: RawGitHubIssue[] = []

  for (let page = 1; page <= MAX_PAGES_PER_LABEL; page += 1) {
    const batch = await fetchIssuesForRepo(client, owner, repo, {
      labels: label,
      state: "open",
      perPage: PER_PAGE,
      page,
    })

    for (const issue of batch) {
      if (!seen.has(issue.number)) {
        seen.add(issue.number)
        collected.push(issue)
      }
    }

    if (batch.length < PER_PAGE) {
      break
    }
  }

  return collected
}
