import type { SoftSignal } from "./types.js"
import type { DomainEvaluationContext } from "./types.js"
import type { GhostWarning } from "./types.js"

const RECENT_COMMENT_WINDOW_DAYS = 90

export function detectSoftSignals(
  context: DomainEvaluationContext,
  warnings: readonly GhostWarning[]
): readonly SoftSignal[] {
  const signals: SoftSignal[] = []

  if (context.repoHasContributingMd) {
    signals.push({
      code: "REPO_HAS_CONTRIBUTING_MD",
      message: "repository has CONTRIBUTING.md",
    })
  }

  if (warnings.length === 0) {
    signals.push({
      code: "NO_GHOST_WARNING",
      message: "no ghost warning detected",
    })
  }

  if (hasRecentHumanComment(context)) {
    signals.push({
      code: "RECENT_HUMAN_COMMENT",
      message: "issue has a recent human comment",
    })
  }

  if (context.issue.hasStructuredBody) {
    signals.push({
      code: "STRUCTURED_OR_DESCRIPTIVE_BODY",
      message: "issue body is structured or descriptive",
    })
  }

  return signals
}

function hasRecentHumanComment(context: DomainEvaluationContext): boolean {
  const lastHumanCommentAt = context.issue.comments.lastHumanCommentAt

  if (!lastHumanCommentAt) {
    return false
  }

  const commentDate = new Date(lastHumanCommentAt)

  if (Number.isNaN(commentDate.getTime())) {
    return false
  }

  const ageMs = context.now.getTime() - commentDate.getTime()
  const maxAgeMs = RECENT_COMMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000

  return ageMs <= maxAgeMs
}
