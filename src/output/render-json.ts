import type { ScanResult, EvaluatedIssue } from "../scan.js"
import type {
  PublicIssue,
  PublicScanOutput,
  PublicSignal,
  PublicWarning,
} from "./types.js"

export function renderJson(result: ScanResult): string {
  const output = toPublicScanOutput(result)
  return JSON.stringify(output, null, 2)
}

function toPublicScanOutput(result: ScanResult): PublicScanOutput {
  return {
    repo: { owner: result.repo.owner, name: result.repo.name },
    scannedAt: result.scannedAt,
    stats: {
      totalFetched: result.stats.totalFetched,
      passedFilters: result.stats.passedFilters,
      filteredOut: result.stats.filteredOut,
    },
    issues: result.evaluated.map(toPublicIssue),
  }
}

function toPublicIssue(evaluated: EvaluatedIssue): PublicIssue {
  const { issue, warnings, signals, whySelected } = evaluated
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    labels: [...issue.labels],
    updatedAt: issue.updatedAt,
    warnings: warnings.map(toPublicWarning),
    signals: signals.map(toPublicSignal),
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

function toPublicSignal(signal: { readonly code: string; readonly message: string }): PublicSignal {
  return { code: signal.code, message: signal.message }
}
