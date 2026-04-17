import type { OrgScanResult } from "../org-scan.js"
import type { EvaluatedIssue } from "../scan.js"
import type { PublicOrgIssue, PublicOrgScanOutput, PublicWarning, PublicSignal } from "./types.js"

export function renderOrgJson(result: OrgScanResult): string {
  return JSON.stringify(toPublicOrgScanOutput(result), null, 2)
}

function toPublicOrgScanOutput(result: OrgScanResult): PublicOrgScanOutput {
  return {
    org: result.org,
    scannedAt: result.scannedAt,
    truncated: result.truncated,
    stats: {
      reposScanned: result.stats.reposScanned,
      reposWithResults: result.stats.reposWithResults,
      reposFailed: result.stats.reposFailed,
      totalFetched: result.stats.totalFetched,
      passedFilters: result.stats.passedFilters,
      filteredOut: result.stats.filteredOut,
    },
    issues: result.evaluated.map(toPublicOrgIssue),
    repoErrors: result.repoErrors.map((e) => ({
      owner: e.owner,
      name: e.name,
      message: e.message,
    })),
  }
}

function toPublicOrgIssue(evaluated: EvaluatedIssue): PublicOrgIssue {
  const { issue, warnings, signals, whySelected } = evaluated
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    repo: { owner: issue.repo.owner, name: issue.repo.name },
    labels: [...issue.labels],
    updatedAt: issue.updatedAt,
    warnings: warnings.map(toPublicWarning),
    signals: signals.map((s): PublicSignal => ({ code: s.code, message: s.message })),
    whySelected: whySelected.text,
  }
}

function toPublicWarning(warning: {
  readonly code: string
  readonly message: string
  readonly matchedKeyword?: string
}): PublicWarning {
  const base: PublicWarning = { code: warning.code, message: warning.message }
  if (warning.matchedKeyword !== undefined) {
    return { ...base, matchedKeyword: warning.matchedKeyword }
  }
  return base
}
