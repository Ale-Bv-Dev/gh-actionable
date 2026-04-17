import type { NormalizedIssue } from "./issue.js"

export interface DomainEvaluationContext {
  readonly issue: NormalizedIssue
  readonly repoHasContributingMd: boolean
  readonly now: Date
}

export type HardFilterCode =
  | "ISSUE_NOT_OPEN"
  | "MISSING_ACTIONABLE_LABEL"
  | "HAS_ASSIGNEE"
  | "HAS_LINKED_OPEN_PR"
  | "HAS_NEGATIVE_LABEL"
  | "LACKS_RECENT_REAL_ACTIVITY"

export interface HardFilterFailure {
  readonly code: HardFilterCode
  readonly message: string
}

export interface HardFilterResult {
  readonly passed: boolean
  readonly failures: readonly HardFilterFailure[]
}

export type GhostWarningCode =
  | "LAST_COMMENT_FROM_BOT"
  | "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD"

export interface GhostWarning {
  readonly code: GhostWarningCode
  readonly message: string
  readonly matchedKeyword?: string
}

export type SoftSignalCode =
  | "REPO_HAS_CONTRIBUTING_MD"
  | "NO_GHOST_WARNING"
  | "RECENT_HUMAN_COMMENT"
  | "STRUCTURED_OR_DESCRIPTIVE_BODY"

export interface SoftSignal {
  readonly code: SoftSignalCode
  readonly message: string
}

export interface WhySelectedResult {
  readonly text: string
}
