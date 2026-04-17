import type { GhostWarning } from "./types.js"
import type { NormalizedIssue } from "./issue.js"

const CONSERVATIVE_GHOST_KEYWORDS = ["won't fix", "duplicate of", "closing as"] as const

export function detectGhostWarnings(issue: NormalizedIssue): readonly GhostWarning[] {
  const warnings: GhostWarning[] = []

  if (issue.comments.lastCommentAuthorType === "bot") {
    warnings.push({
      code: "LAST_COMMENT_FROM_BOT",
      message: "last comment is from a bot",
    })
  }

  const matchedKeyword = findMatchedGhostKeyword(issue.comments.lastRelevantCommentBody)

  if (matchedKeyword) {
    warnings.push({
      code: "LAST_RELEVANT_COMMENT_MATCHED_CONSERVATIVE_KEYWORD",
      message: `last relevant comment matched conservative keyword: ${matchedKeyword}`,
      matchedKeyword,
    })
  }

  return warnings
}

function findMatchedGhostKeyword(body: string | null): string | null {
  if (!body) {
    return null
  }

  const normalizedBody = body.toLowerCase()

  return CONSERVATIVE_GHOST_KEYWORDS.find((keyword) => normalizedBody.includes(keyword)) ?? null
}
