# Project Log — gh-actionable

## Project note

`gh-actionable` is a separate project derived from prior workflow experience during conservative open-source issue selection around `ethereum/ethereum-org-website`.

It was chosen because it turns a real, repeated workflow problem into a small public CLI with an intentionally narrow MVP.

This log is project-specific and operational. It is not part of the Ethereum contribution report chain.

## 2026-04-13 — Project setup and foundation progress

### Why this project was chosen

1. it emerged from a real issue-selection workflow already tested in practice
2. it supports a narrow and disciplined MVP
3. it is suitable as a small public GitHub tool without requiring a broad product surface

### Phase 1 completed

Completed:
1. scaffold created
2. `package.json`
3. `tsconfig.json`
4. `.gitignore`
5. `.env.example`
6. `README.md`
7. initial folder structure

### Documentation foundation completed

Completed:
1. `docs/README.md`
2. `docs/specs/mvp-v1.md`
3. `docs/adr/0001-runtime-and-cli-foundation.md`
4. `docs/adr/0002-github-access-and-data-source.md`
5. `docs/adr/0003-local-output-and-cache-boundaries.md`

### Phase 2 foundation completed

Completed:
1. auth foundation
2. GitHub client foundation
3. explicit error model
4. retry foundation
5. normalized issue model

### Phase 3 decision layer completed

Completed:
1. hard filters
2. ghost warnings
3. soft signals
4. `why selected`
5. cleanup/alignment for:
   `last relevant comment`
   warning summary wording

## 2026-04-14 — GitHub payload normalization and test suite

### Phase 4a: GitHub payload normalization completed

Completed:
1. `src/github/fetch.ts` — API fetch functions with retry and error wrapping
   - `fetchIssuesForRepo` (paginated, filters out PRs from issue endpoint)
   - `fetchIssueComments` (last 30 desc, maps to `GitHubCommentSummary`)
   - `fetchLinkedPullRequests` (timeline events, cap 100, deduped by PR number)
   - `checkContributingMd` (root CONTRIBUTING.md only — v1 limit)
   - `classifyRawAuthorType` (Bot type + `[bot]` suffix detection)
   - Octokit error wrapping (429 → rate limit; 403 with retry-after → rate limit; 403 without → non-retryable; 5xx → retryable)
2. `src/github/normalize.ts` — pure mapping functions
   - `normalizeIssue` (raw API → `NormalizedIssue`)
   - `deriveCommentMeta` (last comment, last relevant non-bot, last human)
   - `deriveLastHumanActivityAt` (max of human comment date and created_at if author is human)
   - `deriveHasStructuredBody` (body ≥ 120 chars + structural indicator)

### Approved v1 decisions for normalization

1. Timeline pagination: cap at 100 events (first page only). Accept false negatives on very active issues.
2. Comment fetch: 30 comments as buffer. Only extract what domain layer needs.
3. Issue author for `lastHumanActivityAt`: if issue author is human, use `created_at`. If bot or unknown, do not.
4. `hasStructuredBody` heuristic: body ≥ 120 chars AND at least one markdown heading, list, code block, or HTML heading.
5. CONTRIBUTING.md check: root only. Case-insensitive via GitHub API. v1 limitation.

### Phase 4b: test suite completed

Completed:
1. `tests/domain.test.ts` — 35 tests covering hard filters, ghost warnings, soft signals, why-selected
2. `tests/normalize.test.ts` — 26 tests covering normalizeIssue, deriveCommentMeta, deriveLastHumanActivityAt, deriveHasStructuredBody
3. `tests/retry.test.ts` — 6 tests covering withRetry retryable vs non-retryable behavior

All 67 tests passing. Typecheck clean.

## 2026-04-14 — Scan orchestration

### Phase 5: scan orchestration completed

Completed:
1. `src/scan.ts` — repo-level scan orchestrator
   - `scanRepo(client, options)` — full flow: fetch → normalize → evaluate → sort → return
   - `fetchCandidateIssues` — two separate label fetches (`good first issue`, `help wanted`) with dedup by issue number. Two fetches because GitHub REST `labels` param is AND, not OR.
   - Early return when no candidates (skips `checkContributingMd`)
   - Per-issue enrichment: comments + linked PRs → normalize → hard filters → warnings → signals → why-selected
   - Sort by `updatedAt` descending
   - Returns `ScanResult` with `EvaluatedIssue[]` and `ScanStats`
2. `tests/scan.test.ts` — 16 tests covering:
   - Two separate label fetches with correct params
   - CONTRIBUTING.md checked once per repo, skipped when no candidates
   - Deduplication by issue number
   - Hard filter exclusions (stale, assigned, linked PR)
   - Full evaluation output (warnings, signals, whySelected)
   - CONTRIBUTING.md signal presence/absence
   - Ghost warning detection through pipeline
   - Sorting by updatedAt descending
   - Stats computed after dedup
   - Empty results (no candidates, all filtered out)

### Design decisions for scan orchestration

1. Two separate label fetches + dedup instead of single `labels: "good first issue,help wanted"` (GitHub REST labels param is AND).
2. No parallelism for per-issue API calls in v1. Sequential fetch per issue to avoid rate-limit spikes.
3. Single-page fetch (100 issues max per label query). Acceptable v1 limit.
4. `scanRepo` only — no `scanOrg` yet. Org scanning will call `scanRepo` in a loop.
5. Orchestrator does not handle auth. Caller passes a ready Octokit client.
6. Errors bubble up. No catch/wrap at orchestrator level.
7. Early return on empty candidates to avoid unnecessary CONTRIBUTING.md API call.

## 2026-04-15 — Repo-scan pagination and docs cleanup

### Phase 5a: pagination + fetch limit completed

Completed:
1. `src/scan.ts` — repo-scan pagination
   - Private helper `fetchAllPagesForLabel` loops `fetchIssuesForRepo` (single-page primitive) up to 10 pages × 100 results per label
   - Stops when a page returns fewer than `PER_PAGE` items
   - Defensive per-label dedup by issue number during pagination
   - Cross-label dedup unchanged
   - `fetchIssuesForRepo` signature untouched
2. `tests/scan.test.ts` — 5 focused pagination tests (21 total in file, 88 total)
   - Single-page stop condition
   - Multi-page continuation until partial page
   - 10-page safety cap
   - Per-label dedup across pages
   - Stats correct after per-label + cross-label dedup
3. `docs/specs/mvp-v1.md` — new "v1 fetch limitations" section documenting 10-page × 100-result cap (≤1000 issues/label), silent truncation
4. Docs cleanup:
   - `docs/README.md` — fixed absolute local path with wrong base → relative link
   - `docs/specs/mvp-v1.md` — added explicit definition of "last relevant comment" (most recent non-bot comment; includes `user` and `unknown` author types)

### Design decisions for pagination

1. Pagination helper is private inside `src/scan.ts`. `fetchIssuesForRepo` stays a single-page primitive.
2. Hard safety cap at 10 pages per label. Silent truncation in v1. No `truncated` field exposed in `ScanStats`.
3. `per_page` stays at 100 (API default already in use).
4. No `console.warn` in `scan.ts` — truncation documented in spec, not logged at runtime.
5. Defensive per-label dedup kept even though GitHub normally returns distinct issues across pages (protects against mid-pagination shifts).

## 2026-04-16 — Output renderers

### Phase 6: output renderers completed

Completed:
1. `src/output/types.ts` — public projection types for `--json` mode (`PublicScanOutput`, `PublicIssue`, `PublicWarning`, `PublicSignal`). Decoupled from `ScanResult`/`NormalizedIssue` so the JSON shape stays stable even if internals change.
2. `src/output/render-json.ts` — `renderJson(result: ScanResult): string`. Minimal public projection serialized with 2-space pretty print. `matchedKeyword` omitted when absent. Internal fields (`body`, `comments`, `hasStructuredBody`, `lastHumanActivityAt`, issue-level `repo`) intentionally not exposed.
3. `src/output/render-table.ts` — `renderTable(result: ScanResult): string`. Multiline record-per-issue format. Plain text only, no ANSI/colors, no new dependencies. `(none)` placeholder for empty labels/warnings/signals. `; ` separator for warnings/signals messages, `, ` for labels. No trailing newline.
4. `tests/output.test.ts` — 12 focused tests covering: empty result, single issue projection, leak-prevention for internal fields, warnings/signals with and without `matchedKeyword`, determinism, pretty-print format, multi-issue separation, no trailing newline.

All 100 tests passing. Typecheck clean.

### Design decisions for output renderers

1. JSON shape uses a minimal public projection, not direct `JSON.stringify(ScanResult)`. Rationale: stable public contract, smaller output, no accidental leaks of internal normalization shape.
2. Table uses a multiline record-per-issue format rather than fixed columns. Rationale: labels, warnings, signals, and `whySelected` text vary widely in length — fixed columns would be illegible on narrow terminals. No terminal-width handling in v1.
3. No color or ANSI in v1. No `chalk`/`picocolors` or similar dependency added.
4. Renderers are pure: input `ScanResult`, output `string`. No `console.log`, no I/O. The future CLI layer owns stdout.
5. `src/output/` imports `ScanResult`/`EvaluatedIssue` from `src/scan.ts` and domain types via `import type` only. No imports from `src/github/`.
6. "Basic issue identity" in the JSON projection is scoped to `number`, `title`, `url`, `labels`, `updatedAt`. Issue-level `repo` is omitted because the top-level `repo` already identifies the scan target for repo scans.

## 2026-04-16 — Minimal CLI wiring

### Phase 7: minimal CLI wiring completed

Completed:
1. `src/cli/args.ts` — `parseArgs(argv: readonly string[]): ParsedArgs`. Pure, no process.argv access. `CliUsageError` for: no args, missing `--repo`, invalid format (no slash, empty owner/name, multiple slashes), `--org` ("not supported yet"), unknown flags. Deterministic: fails conservatively on typos like `--jsonn`.
2. `src/cli/run.ts` — `run(argv)` orchestrator: `parseArgs` → `resolveGitHubAuth` → `createGitHubClient` → `scanRepo` → `renderTable`/`renderJson` → `process.stdout.write`. No I/O except final stdout write.
3. `src/index.ts` — entry point with `#!/usr/bin/env node` shebang. Calls `run(process.argv.slice(2))`. `.catch` handler formats known errors (`CliUsageError`, `GitHubAuthError`, `GitHubRateLimitError`, `GitHubApiError`) with human-readable messages and calls `process.exit(1)`.
4. `package.json` — added `"bin": { "gh-actionable": "./dist/index.js" }`. Build script updated to `tsc -p tsconfig.build.json`.
5. `tsconfig.build.json` — extends `tsconfig.json`, overrides `rootDir: "src"`, `outDir: "dist"`, `include: ["src/**/*.ts"]`. Produces flat `dist/` without `dist/src/` nesting and without `dist/tests/`.
6. `tests/cli-args.test.ts` — 14 focused tests on `parseArgs`: happy path (repo only, with --json, flag order), no args, missing --repo, invalid formats (no slash, trailing/leading slash, multiple slashes, --repo with no value, --repo followed by flag), --org rejection, unknown flag, typo-like flag.

All 114 tests passing. Typecheck clean. Build emits `dist/index.js` matching `bin` field.

### Design decisions for CLI wiring

1. `parseArgs` is pure (receives `argv` array, not `process.argv` directly) to stay testable without process mocking.
2. Unknown arguments throw `CliUsageError` rather than being silently ignored. Rationale: conservative failure — catches typos like `--jsonn` that would otherwise be invisible.
3. `--org` throws a dedicated "not supported yet" error rather than a generic unknown-arg error. Rationale: clearer UX for a known future flag.
4. `run.ts` is not directly tested with process mocks in this phase. The pipeline (auth → scan → render) is already covered by existing unit suites; `run()` is thin wiring.
5. `tsconfig.build.json` separates build from typecheck. `typecheck` keeps `tsconfig.json` (includes tests for full coverage); `build` uses `tsconfig.build.json` (src only, correct rootDir for bin path).
6. Error formatting in `src/index.ts` checks `GitHubRateLimitError` before `GitHubApiError` (subclass before superclass).

## 2026-04-16 — JSON cache layer

### Phase 8: JSON cache layer completed

Completed:
1. `src/cache/cache.ts` — `scanWithCache(client, options, cacheOptions?)`. Cache file at `~/.cache/gh-actionable/<owner>/<name>.json` (owner and name normalized to lowercase, nested path eliminates collision risk). Envelope format: `{ version, cachedAt, result }`. TTL default 1h (`ageMs >= ttlMs`). Miss on: no file, expired, corrupt JSON, version mismatch, invalid `cachedAt` (NaN guard). Write errors silently swallowed — scan result always returned. `CacheOptions { cacheDir?, ttlMs? }` lets tests override both without process/fs mocks.
2. `src/cli/run.ts` — one-line change: `scanRepo` replaced with `scanWithCache`. `run.ts` remains thin wiring.
3. `tests/cache.test.ts` — 9 focused tests using real temp directories (`mkdtemp`/`rm` in before/after each). Mock on `scanRepo` only. Cases: miss (no file) + write; fresh hit skips scan; expired; corrupt JSON; invalid `cachedAt`; version mismatch; key normalization (uppercase → lowercase path); `ttlMs: 0` expires immediately; write failure is non-fatal.

All 123 tests passing. Typecheck clean. Build clean.

### Design decisions for cache layer

1. Nested path `<owner>/<name>.json` instead of flat `<owner>-<name>.json`. Rationale: eliminates theoretical collision between e.g. `foo-bar/baz` and `foo/bar-baz`.
2. `CacheOptions` object (not positional `cacheDir`) for testability and extensibility without signature churn.
3. `ageMs >= ttlMs` (not `>`). Rationale: `ttlMs: 0` must expire immediately; equality case must be a miss.
4. `isNaN(cachedAtMs)` guard before age calculation. Rationale: an unparseable `cachedAt` string would produce `NaN` age, making the comparison `NaN >= ttlMs` always false — a corrupt entry would stay "fresh" forever without this check.
5. Write errors are silently caught. Rationale: cache is a transparent performance aid; a disk-full or permission error must not break a successful scan.
6. `CACHE_VERSION = 1` in envelope. Rationale: future schema changes can bump the version and old files are automatically treated as misses without manual cache invalidation.

## 2026-04-16 — Org scanning

### Phase 9: org scanning completed

Completed:
1. `src/github/fetch.ts` — added `fetchOrgRepositories(client, org)` and `OrgRepoInfo`
   - calls `repos.listForOrg` with type=public, sort=pushed desc
   - paginates up to 5 pages of 100 repos (safety cap)
   - filters out fork, archived, and disabled repos client-side
2. `src/org-scan.ts` — `scanOrg(client, options)` org-level orchestrator
   - truncates to MAX_ORG_REPOS=100 repos; sets `truncated: true` if exceeded
   - scans repos sequentially via `scanWithCache`
   - collects per-repo errors in `repoErrors[]`; scan continues on individual repo failure
   - aggregates stats (totalFetched, passedFilters, filteredOut, reposScanned, reposFailed, reposWithResults)
   - sorts all evaluated issues globally by `updatedAt` descending
   - no org-level cache
3. `src/output/types.ts` — added `PublicOrgIssue` and `PublicOrgScanOutput` public projection types
4. `src/output/render-org-table.ts` — `renderOrgTable(result: OrgScanResult): string`
5. `src/output/render-org-json.ts` — `renderOrgJson(result: OrgScanResult): string`
6. `src/cli/args.ts` — rewritten: `ParsedArgs` is now a discriminated union `{ mode: "repo" } | { mode: "org" }`. `--org owner` supported; `--repo` and `--org` are mutually exclusive; `--org owner/name` (with slash) gives a clear error.
7. `src/cli/run.ts` — branches on `args.mode` to call either `scanWithCache` (repo) or `scanOrg` (org)
8. `tests/cli-args.test.ts` — rewritten: 20 tests (was 14), covering --org happy path, mutual exclusivity, slash-in-org error, all previous --repo cases
9. `tests/org-scan.test.ts` — 8 new tests for `scanOrg`
10. `tests/org-output.test.ts` — 10 new tests for org renderers
11. `tests/github-fetch.test.ts` — 10 new tests for `fetchOrgRepositories` directly (call params, filtering, pagination, safety cap)

All 157 tests passing. Typecheck clean. Build clean.

### Design decisions for org scanning

1. Sequential per-repo scan via `scanWithCache`. No concurrency in v1. Rationale: avoids rate-limit spikes; org-level scans are not latency-critical.
2. No org-level cache. Rationale: org repo composition changes frequently; per-repo cache from existing `scanWithCache` provides meaningful reuse at the repo level.
3. `repoErrors[]` collected and non-fatal. Rationale: a single inaccessible or rate-limited repo must not abort results from the remaining repos.
4. `ParsedArgs` restructured as a discriminated union (`mode: "repo" | "org"`) rather than an optional-fields flat type. Rationale: eliminates invalid combinations at the type level; `run.ts` exhaustively branches on mode.
5. Org listing filters (fork/archived/disabled) applied client-side after fetch, not via API params. Rationale: `type: "public"` is the only server-side filter available for `repos.listForOrg`; the other properties require client-side filtering.
6. 5-page fetch cap on repo listing and 100-repo scan cap on org scan are separate limits. The fetch cap guards against API overuse on listing; the scan cap guards against runaway scan time on large orgs.

## 2026-04-16 — Closure review fixes

### F-01: issue comment ordering

`fetchIssueComments()` passed `sort: "created"` and `direction: "desc"` to `issues.listComments`, but that endpoint does not support sort/direction parameters. `normalize.ts` depended on newest-first order.

Fix: removed unsupported params from the API call; added client-side sort by `created_at` descending before mapping to `GitHubCommentSummary`. 5 new tests in `tests/github-fetch.test.ts` covering: supported params only, sort from ascending and shuffled input, empty list, field mapping.

### F-02: cache privacy — stripped result

Cache stored full `ScanResult` including `NormalizedIssue.body` (issue text) and `IssueCommentMeta.lastCommentBody` / `lastRelevantCommentBody` (comment text). These fields are not needed after evaluation has run.

Fix:
- `CACHE_VERSION` bumped to 2; version 1 files treated as misses
- New internal types `CachedIssue` (6 fields), `CachedEvaluatedIssue`, `CachedScanResult`
- `toStripped()` projects `ScanResult` → `CachedScanResult` before writing (drops body, comments text, hasStructuredBody, lastHumanActivityAt, assigneeCount, hasAssignee, linkedOpenPrCount, state)
- `fromStripped()` reconstructs a valid `ScanResult` with zero values for stripped fields on read
- 2 new tests: "does not write body or comment text to cache file"; "returns null body and stripped fields from cache hit"

### F-03: CLI segment validation

Existing format checks (slash count, empty parts, slash-in-org) did not catch segments like `..` or inputs with whitespace, which could reach cache path construction before GitHub validation.

Fix: `assertValidGitHubSegment(value, label)` helper in `src/cli/args.ts`. Rules: not `.` or `..`; must match `/^[A-Za-z0-9_.-]+$/`. Applied to repo owner, repo name, and org after existing format checks. 8 new tests in `tests/cli-args.test.ts`: `..` owner, `..` name, whitespace owner, whitespace name, `..` org, whitespace org, valid chars pass (×2).

All 172 tests passing. Typecheck clean. Build clean.

## 2026-04-16 — Smoke-test fixes

### F-04: Status: Stale as negative label

Smoke test on `ethereum/ethereum-org-website` selected issue #11833 "Suggest a developer tool" with labels including `Status: Stale`, `help wanted`, and `good first issue`. The hard filter in `src/domain/filters.ts` held `NEGATIVE_LABELS = Set(["wontfix", "duplicate", "invalid", "stale"])`. After normalization (`trim().toLowerCase()`), `"Status: Stale"` became `"status: stale"`, which did not match the bare `"stale"` entry.

Fix: added `"status: stale"` to `NEGATIVE_LABELS`. No fuzzy matching, no wildcard, no scope expansion. 3 focused tests added to `tests/domain.test.ts`: `Status: Stale` (real-world case), `status: stale` (lowercase), and an innocent extra label that must not trigger exclusion.

### F-05: Avoid deprecated CONTRIBUTING.md check

`checkContributingMd()` in `src/github/fetch.ts` used `client.rest.repos.getContent({ path: "CONTRIBUTING.md" })`, which produces an Octokit deprecation warning in recent versions of the library.

Fix: replaced the Contents API call with a two-call sequence:
1. `client.rest.repos.get({ owner, repo })` — reads `default_branch`
2. `client.rest.git.getTree({ owner, repo, tree_sha: default_branch, recursive: "false" })` — checks root tree entries for an item whose `path.toLowerCase() === "contributing.md"` and `type === "blob"` (or type absent)

404 → `false` behavior preserved; all other errors still propagate. 5 focused tests added to `tests/github-fetch.test.ts`: true on `CONTRIBUTING.md`, true on `contributing.md` (case-insensitive), false when absent, false on 404, and assertion that `repos.getContent` is never called.

Smoke test on `ethereum/ethereum-org-website` (no cache): no deprecation warning, `Status: Stale` issue no longer selected, result: 6 fetched, 0 selected, 6 filtered out.

All 180 tests passing. Typecheck clean. Build clean.

### F-06: Paginate issue comments up to 3 pages

`fetchIssueComments()` fetched only the first 30 comments and sorted that page client-side. Issues with more than 30 comments could miss a newer comment on a later page, producing incorrect latest-comment semantics for ghost warnings and `lastHumanActivityAt`.

Fix: replaced the single-page fetch with a loop in `src/github/fetch.ts`:
- `COMMENTS_PER_PAGE` raised from 30 to 100
- New `MAX_COMMENT_PAGES = 3` constant (conservative cap: up to 300 comments per issue)
- Each page is wrapped with `withRetry` individually (consistent with `fetchOrgRepositories`)
- All pages collected before client-side sort
- Loop stops early when a page returns fewer than `COMMENTS_PER_PAGE` items

3 focused tests added to `tests/github-fetch.test.ts`: stops after page 1 when response is partial; surfaces newest comment from page 2 on a 101-comment issue; stops at the 3-page safety cap. 1 existing param test updated (`per_page: 30 -> 100`, `page: 1` added).

All 183 tests passing. Typecheck clean. Build clean.

## Current status

Current verified status:
1. project is in progress
2. MVP scope, spec, ADRs, and project log are defined
3. Phase 1 scaffold: COMPLETED
4. Phase 2 GitHub access foundation: COMPLETED
5. Phase 3 pure domain decision layer: COMPLETED
6. Phase 4a GitHub payload normalization: COMPLETED
7. Phase 4b test suite (domain + normalize + retry): COMPLETED
8. Phase 5 scan orchestration: COMPLETED
9. Phase 5a repo-scan pagination + docs cleanup: COMPLETED
10. Phase 6 output renderers (JSON + table): COMPLETED
11. Phase 7 minimal CLI wiring: COMPLETED
12. Phase 8 JSON cache layer: COMPLETED
13. Phase 9 org scanning: COMPLETED
14. Closure review F-01 (comment sort): COMPLETED
15. Closure review F-02 (cache redaction): COMPLETED
16. Closure review F-03 (segment validation): COMPLETED
17. Smoke-test fix F-04 (Status: Stale negative label): COMPLETED
18. Smoke-test fix F-05 (avoid deprecated CONTRIBUTING.md check): COMPLETED
19. Fix F-06 (paginate issue comments up to 3 pages x 100): COMPLETED
20. typecheck passing, 183/183 tests passing
21. v1 functional scope is now implemented
