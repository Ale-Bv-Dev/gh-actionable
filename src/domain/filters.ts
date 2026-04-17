import type { HardFilterFailure, HardFilterResult } from "./types.js"
import type { DomainEvaluationContext } from "./types.js"

const ACTIONABLE_LABELS = new Set(["good first issue", "help wanted"])
const NEGATIVE_LABELS = new Set(["wontfix", "duplicate", "invalid", "stale", "status: stale"])
const RECENT_ACTIVITY_WINDOW_DAYS = 90

export function evaluateHardFilters(context: DomainEvaluationContext): HardFilterResult {
  const failures: HardFilterFailure[] = []

  addFailureIfPresent(failures, checkIssueIsOpen(context))
  addFailureIfPresent(failures, checkHasActionableLabel(context))
  addFailureIfPresent(failures, checkHasNoAssignee(context))
  addFailureIfPresent(failures, checkHasNoLinkedOpenPr(context))
  addFailureIfPresent(failures, checkHasNoNegativeLabels(context))
  addFailureIfPresent(failures, checkHasRecentRealActivity(context))

  return {
    passed: failures.length === 0,
    failures,
  }
}

export function checkIssueIsOpen(context: DomainEvaluationContext): HardFilterFailure | null {
  return context.issue.state === "open"
    ? null
    : failure("ISSUE_NOT_OPEN", "issue is not open")
}

export function checkHasActionableLabel(
  context: DomainEvaluationContext
): HardFilterFailure | null {
  const normalizedLabels = context.issue.labels.map(normalizeLabel)

  return normalizedLabels.some((label) => ACTIONABLE_LABELS.has(label))
    ? null
    : failure(
        "MISSING_ACTIONABLE_LABEL",
        "issue does not have good first issue or help wanted"
      )
}

export function checkHasNoAssignee(context: DomainEvaluationContext): HardFilterFailure | null {
  return !context.issue.hasAssignee && context.issue.assigneeCount === 0
    ? null
    : failure("HAS_ASSIGNEE", "issue has an assignee")
}

export function checkHasNoLinkedOpenPr(
  context: DomainEvaluationContext
): HardFilterFailure | null {
  return context.issue.linkedOpenPrCount === 0
    ? null
    : failure("HAS_LINKED_OPEN_PR", "issue has a linked open pull request")
}

export function checkHasNoNegativeLabels(
  context: DomainEvaluationContext
): HardFilterFailure | null {
  const matchedLabel = context.issue.labels.map(normalizeLabel).find((label) => {
    return NEGATIVE_LABELS.has(label)
  })

  return matchedLabel
    ? failure("HAS_NEGATIVE_LABEL", `issue has negative label: ${matchedLabel}`)
    : null
}

export function checkHasRecentRealActivity(
  context: DomainEvaluationContext
): HardFilterFailure | null {
  const lastHumanActivityAt = context.issue.lastHumanActivityAt

  if (!lastHumanActivityAt) {
    return failure(
      "LACKS_RECENT_REAL_ACTIVITY",
      "issue has no human-authored activity timestamp"
    )
  }

  const activityDate = new Date(lastHumanActivityAt)

  if (Number.isNaN(activityDate.getTime())) {
    return failure(
      "LACKS_RECENT_REAL_ACTIVITY",
      "issue has an invalid human-authored activity timestamp"
    )
  }

  const ageMs = context.now.getTime() - activityDate.getTime()
  const maxAgeMs = RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000

  return ageMs <= maxAgeMs
    ? null
    : failure(
        "LACKS_RECENT_REAL_ACTIVITY",
        "issue does not have human-authored activity within the last 90 days"
      )
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

function failure(code: HardFilterFailure["code"], message: string): HardFilterFailure {
  return { code, message }
}

function addFailureIfPresent(
  failures: HardFilterFailure[],
  maybeFailure: HardFilterFailure | null
): void {
  if (maybeFailure) {
    failures.push(maybeFailure)
  }
}
