# ADR 0003: Local Output and Cache Boundaries

## Status

Accepted

## Decision

For v1:

- use a terminal table as the default output
- support `--json` as the secondary output mode
- use a simple JSON cache with TTL
- do not use SQLite
- do not support markdown export
- do not support `--open`

## Why

The MVP should stay small, inspectable, and useful from the terminal.

A default terminal table supports the main interactive use case. `--json` is enough for structured downstream use without expanding into richer export features. A JSON cache with TTL is the smallest practical cache that reduces repeated API calls without introducing database complexity.

SQLite, markdown export, and `--open` are all reasonable ideas, but they are not necessary for the first useful version.

## Consequences

- output behavior stays simple and predictable
- cache implementation remains lightweight
- v1 avoids extra UX and persistence surface area that would dilute the MVP
