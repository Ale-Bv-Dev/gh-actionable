# Documentation Model

This project uses a small spec-driven documentation structure.

## What specs are for

Specs define product behavior. They describe what the tool must do, what is in scope, and what is explicitly out of scope.

## What ADRs are for

ADRs record important technical and structural decisions. They explain why a path was chosen, especially where other reasonable options existed.

## Canonical source for MVP behavior

The canonical source for MVP v1 behavior is:

- [`docs/specs/mvp-v1.md`](./specs/mvp-v1.md)

If implementation details or ADR wording ever conflict with the MVP behavior, the spec wins.

## Recommended reading order

1. [`docs/specs/mvp-v1.md`](./specs/mvp-v1.md)
2. [`docs/adr/0001-runtime-and-cli-foundation.md`](./adr/0001-runtime-and-cli-foundation.md)
3. [`docs/adr/0002-github-access-and-data-source.md`](./adr/0002-github-access-and-data-source.md)
4. [`docs/adr/0003-local-output-and-cache-boundaries.md`](./adr/0003-local-output-and-cache-boundaries.md)

## Why this project uses this structure

`gh-actionable` is intentionally MVP-first. This structure keeps product behavior explicit, technical choices traceable, and scope creep easier to resist.
