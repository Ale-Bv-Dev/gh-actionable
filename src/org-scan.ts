import type { Octokit } from "@octokit/rest"

import type { EvaluatedIssue } from "./scan.js"
import { scanWithCache } from "./cache/cache.js"
import { fetchOrgRepositories } from "./github/fetch.js"

// --- Types ---

export interface ScanOrgOptions {
  readonly org: string
  readonly now?: Date
}

export interface OrgScanStats {
  readonly reposScanned: number
  readonly reposWithResults: number
  readonly reposFailed: number
  readonly totalFetched: number
  readonly passedFilters: number
  readonly filteredOut: number
}

export interface OrgRepoError {
  readonly owner: string
  readonly name: string
  readonly message: string
}

export interface OrgScanResult {
  readonly org: string
  readonly evaluated: readonly EvaluatedIssue[]
  readonly scannedAt: string
  readonly stats: OrgScanStats
  readonly truncated: boolean
  readonly repoErrors: readonly OrgRepoError[]
}

// --- Constants ---

const MAX_ORG_REPOS = 100

// --- Orchestrator ---

export async function scanOrg(
  client: Octokit,
  options: ScanOrgOptions
): Promise<OrgScanResult> {
  const { org } = options
  const now = options.now ?? new Date()

  const allRepos = await fetchOrgRepositories(client, org)
  const truncated = allRepos.length > MAX_ORG_REPOS
  const repos = truncated ? allRepos.slice(0, MAX_ORG_REPOS) : allRepos

  const allEvaluated: EvaluatedIssue[] = []
  const repoErrors: OrgRepoError[] = []
  let totalFetched = 0
  let filteredOut = 0

  for (const repo of repos) {
    try {
      const result = await scanWithCache(client, { owner: repo.owner, name: repo.name, now })
      for (const evaluated of result.evaluated) {
        allEvaluated.push(evaluated)
      }
      totalFetched += result.stats.totalFetched
      filteredOut += result.stats.filteredOut
    } catch (error) {
      repoErrors.push({
        owner: repo.owner,
        name: repo.name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Sort globally by updatedAt descending
  allEvaluated.sort(
    (a, b) => new Date(b.issue.updatedAt).getTime() - new Date(a.issue.updatedAt).getTime()
  )

  const reposWithResultsSet = new Set(
    allEvaluated.map((e) => `${e.issue.repo.owner}/${e.issue.repo.name}`)
  )

  return {
    org,
    evaluated: allEvaluated,
    scannedAt: now.toISOString(),
    stats: {
      reposScanned: repos.length - repoErrors.length,
      reposWithResults: reposWithResultsSet.size,
      reposFailed: repoErrors.length,
      totalFetched,
      passedFilters: allEvaluated.length,
      filteredOut,
    },
    truncated,
    repoErrors,
  }
}
