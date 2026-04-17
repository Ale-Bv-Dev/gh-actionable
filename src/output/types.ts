// Public output projection types for `--json` mode.
// Kept decoupled from internal NormalizedIssue/ScanResult so the JSON shape
// stays stable even if internals change.

export interface PublicWarning {
  readonly code: string
  readonly message: string
  readonly matchedKeyword?: string
}

export interface PublicSignal {
  readonly code: string
  readonly message: string
}

export interface PublicIssue {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly labels: readonly string[]
  readonly updatedAt: string
  readonly warnings: readonly PublicWarning[]
  readonly signals: readonly PublicSignal[]
  readonly whySelected: string
}

export interface PublicOrgIssue extends PublicIssue {
  readonly repo: {
    readonly owner: string
    readonly name: string
  }
}

export interface PublicOrgScanOutput {
  readonly org: string
  readonly scannedAt: string
  readonly truncated: boolean
  readonly stats: {
    readonly reposScanned: number
    readonly reposWithResults: number
    readonly reposFailed: number
    readonly totalFetched: number
    readonly passedFilters: number
    readonly filteredOut: number
  }
  readonly issues: readonly PublicOrgIssue[]
  readonly repoErrors: readonly {
    readonly owner: string
    readonly name: string
    readonly message: string
  }[]
}

export interface PublicScanOutput {
  readonly repo: {
    readonly owner: string
    readonly name: string
  }
  readonly scannedAt: string
  readonly stats: {
    readonly totalFetched: number
    readonly passedFilters: number
    readonly filteredOut: number
  }
  readonly issues: readonly PublicIssue[]
}
