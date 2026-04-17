# MVP v1 Spec

## Project goal

`gh-actionable` is a local CLI that conservatively surfaces actionable GitHub issues in a known repository or organization.

The goal of v1 is not broad issue discovery. The goal is to reduce obvious false positives when checking contribution candidates in a known `--repo` or `--org`.

## Exact v1 scope

v1 must:

- scan a known repository via `--repo owner/name`
- scan a known organization via `--org owner`
- resolve authentication using:
  - `GITHUB_TOKEN`
  - then `gh auth token`
  - otherwise fail with a clear error
- fetch the issue and related metadata needed for filtering
- apply hard filters
- add anti-ghost warnings
- calculate soft signals
- sort results by recent real activity
- output a terminal table by default
- support `--json`
- use a simple JSON cache with TTL

## Supported inputs

- `--repo owner/name`
- `--org owner`

At least one of these must be provided for a scan.

## Authentication behavior

Authentication must be resolved in this order:

1. `GITHUB_TOKEN`
2. `gh auth token`
3. clear error if neither is available

There is no anonymous fallback in v1.

## Hard filters

An issue must satisfy all of the following to be included:

- issue is open
- issue has `good first issue` or `help wanted`
- issue has no assignee
- issue has no linked open PR
- issue has no negative labels such as `wontfix`, `duplicate`, `invalid`, `stale`
- issue has recent real activity, defined in v1 as at least one human-authored issue update or comment within the last 90 days

Hard filters are exclusion rules. If one fails, the issue is not included.

## Anti-ghost warnings

Warnings do not exclude an issue by themselves.

In v1, "last relevant comment" means the most recent comment whose author is not a bot. This includes both human users and authors whose type cannot be determined. Bot comments are skipped when locating the last relevant comment.

v1 warning rules:

- warn if the last comment is from a bot
- warn on conservative keyword matches in the last relevant comment, such as:
  - `won't fix`
  - `duplicate of`
  - `closing as`

Warnings are informational and must stay separate from hard filters.

## Soft signals

Soft signals are positive hints shown for included issues. They are not exclusions and must not duplicate hard filters.

v1 soft signals:

- repository has `CONTRIBUTING.md`
- no ghost warning
- recent human comment
- issue body is reasonably structured or descriptive

## Sorting rule

Included issues must be sorted by recent real activity using `updated_at` descending.

## Output modes

v1 output modes:

- terminal table by default
- `--json` as structured machine-readable output

Each included issue should expose:

- basic issue identity
- warnings
- soft signals
- a short `why selected` explanation

## Cache behavior

v1 uses a simple JSON cache with TTL.

The cache is a local performance aid only. It must not change filtering rules or decision semantics.

## Verification and test scope

v1 verification scope:

- unit tests for filter logic
- unit tests for warning logic
- one `429/retry` test
- basic cache TTL verification

v1 does not require a broad snapshot-heavy suite.

## v1 fetch limitations

The repo scan paginates issue listings up to 10 pages of 100 results per label query. Repositories with more than 1000 matching issues per label may have additional candidates that are not surfaced in v1. Truncation is silent in v1 and not exposed in the result.

## v1 org scan behavior

When `--org owner` is specified:

- Only public, non-fork, non-archived, non-disabled repositories are listed.
- Organization repository listing fetches up to 5 pages of 100 repositories. Organizations with more than 500 listed repositories before filtering may have candidates that are not surfaced.
- At most 100 repositories are scanned per org run. If more than 100 repositories remain after filtering, the result notes the truncation.
- Repositories are scanned sequentially. No concurrency in v1.
- A repository scan error is collected and noted in the output without stopping the org scan.
- There is no org-level cache in v1. The per-repo cache applies to each repository scan individually.

## Non-goals for v1

The following are explicitly out of scope:

- discovery mode
- weighted scoring
- SQLite
- markdown export
- `--open`
- NLP or semantic maintainer-comment analysis
- broader recommendation heuristics beyond the defined hard filters, warnings, and soft signals
