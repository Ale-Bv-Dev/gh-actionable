import type { NormalizedIssue } from "./issue.js"
import type { GhostWarning, SoftSignal, WhySelectedResult } from "./types.js"

export function buildWhySelected(
  issue: NormalizedIssue,
  signals: readonly SoftSignal[],
  warnings: readonly GhostWarning[]
): WhySelectedResult {
  const parts: string[] = []

  const actionableLabels = issue.labels.filter((label) => {
    const normalized = label.trim().toLowerCase()
    return normalized === "good first issue" || normalized === "help wanted"
  })

  if (actionableLabels.length > 0) {
    parts.push(`labeled ${actionableLabels.join(" + ")}`)
  }

  if (!issue.hasAssignee) {
    parts.push("unassigned")
  }

  if (issue.linkedOpenPrCount === 0) {
    parts.push("no linked open PR")
  }

  const signalSummaries = summarizeSignals(signals)
  if (signalSummaries.length > 0) {
    parts.push(...signalSummaries)
  }

  const warningSummary = summarizeWarnings(warnings)
  if (warningSummary) {
    parts.push(warningSummary)
  }

  return {
    text: parts.join("; "),
  }
}

function summarizeSignals(signals: readonly SoftSignal[]): string[] {
  return signals.slice(0, 2).map((signal) => {
    switch (signal.code) {
      case "REPO_HAS_CONTRIBUTING_MD":
        return "repo has CONTRIBUTING.md"
      case "NO_GHOST_WARNING":
        return "no ghost warning"
      case "RECENT_HUMAN_COMMENT":
        return "recent human comment"
      case "STRUCTURED_OR_DESCRIPTIVE_BODY":
        return "structured issue body"
    }
  })
}

function summarizeWarnings(warnings: readonly GhostWarning[]): string | null {
  if (warnings.some((warning) => warning.code === "LAST_COMMENT_FROM_BOT")) {
    return "bot-last-comment warning"
  }

  if (
    warnings.some(
      (warning) => warning.code === "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD"
    )
  ) {
    return "keyword warning present"
  }

  return null
}
