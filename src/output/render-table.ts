import type { ScanResult, EvaluatedIssue } from "../scan.js"
import { sanitizeForTerminal } from "./sanitize.js"

const EMPTY_PLACEHOLDER = "(none)"
const LIST_SEPARATOR = ", "
const MESSAGE_SEPARATOR = "; "
const INDENT = "  "

export function renderTable(result: ScanResult): string {
  const lines: string[] = []

  lines.push(`gh-actionable scan — ${result.repo.owner}/${result.repo.name}`)
  lines.push(`scanned: ${result.scannedAt}`)
  lines.push(
    `stats:   ${result.stats.totalFetched} fetched, ${result.stats.passedFilters} selected, ${result.stats.filteredOut} filtered out`
  )
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
    `#${issue.number}  ${title}`,
    `${INDENT}labels:   ${labels}`,
    `${INDENT}updated:  ${issue.updatedAt}`,
    `${INDENT}warnings: ${warningsText}`,
    `${INDENT}signals:  ${signalsText}`,
    `${INDENT}why:      ${whyText}`,
    `${INDENT}url:      ${url}`,
  ]
}
