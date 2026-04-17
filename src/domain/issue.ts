export interface RepoRef {
  readonly owner: string
  readonly name: string
}

export interface IssueCommentMeta {
  readonly totalCount: number
  readonly lastCommentAuthorType: "bot" | "user" | "unknown" | null
  readonly lastCommentBody: string | null
  readonly lastCommentCreatedAt: string | null
  readonly lastRelevantCommentBody: string | null
  readonly lastRelevantCommentCreatedAt: string | null
  readonly lastHumanCommentAt: string | null
}

export interface NormalizedIssue {
  readonly repo: RepoRef
  readonly number: number
  readonly title: string
  readonly url: string
  readonly state: "open" | "closed"
  readonly labels: readonly string[]
  readonly assigneeCount: number
  readonly hasAssignee: boolean
  readonly linkedOpenPrCount: number
  readonly updatedAt: string
  readonly lastHumanActivityAt: string | null
  readonly body: string | null
  readonly hasStructuredBody: boolean
  readonly comments: IssueCommentMeta
}
