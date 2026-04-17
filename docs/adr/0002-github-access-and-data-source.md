# ADR 0002: GitHub Access and Data Source

## Status

Accepted

## Decision

Use GitHub as the source of truth for issue and PR state.

Use Octokit for GitHub API access in v1, with authentication resolved in this order:

1. `GITHUB_TOKEN`
2. `gh auth token`
3. clear error if neither is available

## Why

The tool exists to evaluate live GitHub issue candidates. That requires current issue state, labels, assignees, comments, and PR linkage.

GitHub itself is the authoritative source for that data. Octokit is the standard Node.js client for GitHub API access and keeps the implementation explicit and testable. The auth fallback supports both scripted use and local developer workflows without adding extra credential flows.

Failing clearly when no token source is available is preferable to ambiguous degraded behavior.

## Consequences

- v1 depends on GitHub API access for real issue evaluation
- issue and PR state must be verified from GitHub data, not inferred from local assumptions
- auth behavior is deterministic and easy to explain
