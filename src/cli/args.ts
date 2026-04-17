export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CliUsageError"
  }
}

export type ParsedArgs =
  | { readonly mode: "repo"; readonly owner: string; readonly name: string; readonly json: boolean }
  | { readonly mode: "org"; readonly org: string; readonly json: boolean }

const USAGE = "Usage: gh-actionable (--repo owner/name | --org owner) [--json]"

// Allowed: letters, numbers, hyphen, underscore, dot — no whitespace, no path separators
const GITHUB_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/

function assertValidGitHubSegment(value: string, label: string): void {
  if (value === "." || value === "..") {
    throw new CliUsageError(`invalid ${label} "${value}": path traversal not allowed\n${USAGE}`)
  }
  if (!GITHUB_SEGMENT_RE.test(value)) {
    throw new CliUsageError(
      `invalid ${label} "${value}": only letters, numbers, -, _, and . are allowed\n${USAGE}`
    )
  }
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0) {
    throw new CliUsageError(USAGE)
  }

  let repoArg: string | undefined
  let orgArg: string | undefined
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "--repo") {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("--")) {
        throw new CliUsageError(`--repo requires a value in the format owner/name\n${USAGE}`)
      }
      repoArg = next
      i++ // consume the value token
    } else if (arg === "--org") {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("--")) {
        throw new CliUsageError(`--org requires a value\n${USAGE}`)
      }
      orgArg = next
      i++ // consume the value token
    } else if (arg === "--json") {
      json = true
    } else {
      throw new CliUsageError(`Unknown argument: ${arg}\n${USAGE}`)
    }
  }

  if (repoArg !== undefined && orgArg !== undefined) {
    throw new CliUsageError(`--repo and --org are mutually exclusive\n${USAGE}`)
  }

  if (repoArg === undefined && orgArg === undefined) {
    throw new CliUsageError(`--repo or --org is required\n${USAGE}`)
  }

  if (repoArg !== undefined) {
    const parts = repoArg.split("/")
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new CliUsageError(`invalid repo format "${repoArg}": expected owner/name\n${USAGE}`)
    }
    assertValidGitHubSegment(parts[0], "repo owner")
    assertValidGitHubSegment(parts[1], "repo name")
    return { mode: "repo", owner: parts[0], name: parts[1], json }
  }

  // org mode
  const org = orgArg as string
  if (org.includes("/")) {
    throw new CliUsageError(
      `invalid org format "${org}": expected org name without slash\n${USAGE}`
    )
  }
  assertValidGitHubSegment(org, "org")
  return { mode: "org", org, json }
}
