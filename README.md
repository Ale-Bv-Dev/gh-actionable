# gh-actionable

`gh-actionable` is a small open-source, local TypeScript CLI for conservatively surfacing actionable GitHub issues in a known repository or organization.

It is designed to reduce false positives when looking for beginner-friendly open-source contribution candidates.

## Status

MVP v1 functional scope is implemented.

**Current status:**

- Local CLI implemented
- Repo scan implemented
- Org scan implemented
- JSON and table output implemented
- Local JSON cache implemented
- Test suite passing
- Not published to npm
- Intended for local use from a cloned repository
- Not production-ready

This project should not be described as a broad discovery engine, a ranking system, or the best way to find GitHub issues.

## What it does

`gh-actionable` scans a known GitHub repository or organization and returns issues that look actionable under conservative rules.

It currently:

- scans a known `--repo owner/name`
- scans a known `--org owner`
- authenticates through `GITHUB_TOKEN`, then `gh auth token`, else fails clearly
- keeps only open issues with `good first issue` or `help wanted`
- excludes assigned issues
- excludes issues with linked open pull requests
- excludes issues with negative labels
- requires recent real human activity
- adds anti-ghost warnings as warnings only, not hard exclusions
- includes soft signals
- includes a short `why selected` explanation
- outputs a terminal table by default
- supports structured JSON output with `--json`
- uses a local JSON cache with TTL

## Requirements

**Required:**

- Node.js 20 or newer
- npm
- GitHub authentication through one of:
  - `GITHUB_TOKEN`
  - GitHub CLI via `gh auth token`

The tool does not use anonymous GitHub API access in v1.

## Install and build

This project is not published to npm. Clone the repository and build it from source:

```bash
npm install --ignore-scripts
npm run build
```

For local development checks:

```bash
npm run typecheck
npm test
```

## Usage

After building from source, run the CLI through Node:

```bash
node dist/index.js --repo owner/name
```

**Repo scan with table output:**

```bash
node dist/index.js --repo microsoft/vscode
```

**Repo scan with JSON output:**

```bash
node dist/index.js --repo microsoft/vscode --json
```

**Org scan with table output:**

```bash
node dist/index.js --org microsoft
```

**Org scan with JSON output:**

```bash
node dist/index.js --org microsoft --json
```

If linked locally through npm, the binary name is:

```bash
gh-actionable --repo owner/name
gh-actionable --org owner
```

## Authentication

Authentication resolution order:

1. `GITHUB_TOKEN`
2. `gh auth token`
3. clear authentication error

**Example:**

```bash
export GITHUB_TOKEN="your-token-here"
node dist/index.js --repo owner/name
```

Or authenticate with GitHub CLI:

```bash
gh auth login
node dist/index.js --repo owner/name
```

Do not commit tokens or secrets.

## Output modes

Default output is a plain terminal table.

```bash
node dist/index.js --repo owner/name
```

**JSON output:**

```bash
node dist/index.js --repo owner/name --json
```

Org JSON output includes the repository identity for each issue.

## Cache behavior

`gh-actionable` uses a local JSON cache as a performance aid only.

- **Default cache location:** `~/.cache/gh-actionable`
- **Default TTL:** 1 hour

**Cache behavior:**

- cache is local only
- cache does not change filtering rules
- cache does not change decision semantics
- corrupt cache entries are treated as misses
- expired cache entries are treated as misses
- old cache versions are treated as misses
- cache write failures are non-fatal

**Privacy note:**  
The cache stores redacted scan results. It does not store full issue bodies or comment bodies.

## v1 limits

### Repo scan limits

- scans known repositories only
- no discovery mode
- issue candidate pagination is capped
- silent truncation may occur on very large repositories

### Org scan limits

- scans known organizations only
- lists public repositories only
- excludes forked repositories
- excludes archived repositories
- excludes disabled repositories
- repository listing is capped
- at most 100 repositories are scanned per organization
- repository scans are sequential
- per-repository errors are collected and do not stop the whole org scan
- no org-level cache in v1

The tool is intentionally conservative. It may miss valid issues in order to avoid surfacing misleading candidates.

## Non-goals for v1

The following are explicitly out of scope:

- discovery mode
- broad GitHub search
- weighted scoring
- repository ranking
- SQLite
- markdown export
- `--open`
- NLP or semantic maintainer-comment analysis
- automatic claiming or commenting on issues
- automatic pull request creation

## Verification

Current verification commands:

```bash
npm run build
npm run typecheck
npm test
```

**Expected state at the current v1 checkpoint:**

- build passing
- typecheck passing
- tests passing

## Development notes

The project is spec-driven.

**Important docs:**

- `docs/specs/mvp-v1.md`
- `docs/adr/`
- `docs/project-log.md`
- `docs/README.md`

The domain layer is pure and must not import from the GitHub API layer.  
The output layer is pure and returns strings. It does not write to stdout directly.  
The CLI layer owns argument parsing, authentication wiring, scan selection, rendering choice, and stdout/stderr behavior.

## Caution

This open-source project is currently intended for local testing and cautious open-source portfolio development.

It is not published as an npm package and should not be presented as production-ready.
