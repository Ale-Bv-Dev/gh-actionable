import type { OrgScanResult } from "../org-scan.js"
import type { EvaluatedIssue } from "../scan.js"
import { sanitizeForTerminal } from "./sanitize.js"

const EMPTY_PLACEHOLDER = "(none)"
const LIST_SEPARATOR = ", "
const MESSAGE_SEPARATOR = "; "
const INDENT = "  "

export function renderOrgTable(result: OrgScanResult): string {
  const lines: string[] = []
  const { stats } = result

  lines.push(`gh-actionable scan — org: ${result.org}`)
  lines.push(`scanned: ${result.scannedAt}`)

  if (result.truncated) {
    lines.push(`note:     repo list was truncated to 100 repos`)
  }

  lines.push(
    `stats:   ${stats.reposScanned} repos scanned, ${stats.reposWithResults} with results, ` +
      `${stats.totalFetched} fetched, ${stats.passedFilters} selected, ${stats.filteredOut} filtered out`
  )

  if (result.repoErrors.length > 0) {
    lines.push(`errors:  ${result.repoErrors.length} repo(s) failed`)
    for (const err of result.repoErrors) {
      lines.push(`${INDENT}${err.owner}/${err.name}: ${err.message}`)
    }
  }

  lines.push("")

  if (result.evaluated.length === 0) {
    lines.push("no issues matched.")
    return lines.join("\n")
  }

  for (const evaluated of result.evaluated) {
    lines.push(...renderIssueBlock(evaluated))
    lines.push("")
  }

  // Drop trailing blank line for deterministic output
  if (lines[lines.length - 1] === "") {
    lines.pop()
  }

  return lines.join("\n")
}

function renderIssueBlock(evaluated: EvaluatedIssue): string[] {
  const { issue, warnings, signals, whySelected } = evaluated
  const repoLabel = `${issue.repo.owner}/${issue.repo.name}`
  const title = sanitizeForTerminal(issue.title)
  const url = sanitizeForTerminal(issue.url)
  const whyText = sanitizeForTerminal(whySelected.text)
  const labels =
    issue.labels.length > 0
      ? issue.labels.map((l) => sanitizeForTerminal(l)).join(LIST_SEPARATOR)
      : EMPTY_PLACEHOLDER
  const warningsText =
    warnings.length > 0
      ? warnings.map((w) => w.message).join(MESSAGE_SEPARATOR)
      : EMPTY_PLACEHOLDER
  const signalsText =
    signals.length > 0 ? signals.map((s) => s.message).join(MESSAGE_SEPARATOR) : EMPTY_PLACEHOLDER

  return [
    `#${issue.number}  ${title}  [${repoLabel}]`,
    `${INDENT}labels:   ${labels}`,
    `${INDENT}updated:  ${issue.updatedAt}`,
    `${INDENT}warnings: ${warningsText}`,
    `${INDENT}signals:  ${signalsText}`,
    `${INDENT}why:      ${whyText}`,
    `${INDENT}url:      ${url}`,
  ]
}
