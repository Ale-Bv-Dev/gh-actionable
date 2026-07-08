# ADR 0004: Sanitize Untrusted Text in Terminal Output

## Status

Accepted

## Decision

For the table renderers only (`render-table.ts`, `render-org-table.ts`):

- strip OSC sequences, ANSI escapes, C0/C1 control characters, and Unicode
  bidi-override code points from every externally-sourced field before it is
  printed: issue title, labels, `whySelected.text`, and `issue.url`
- keep this logic in a small, pure, dependency-free module
  (`src/output/sanitize.ts`)
- leave `--json` output and all filter/decision semantics untouched

## Why

Issue titles and label names come from whoever opened the issue in a scanned
repository — they are untrusted. Printing them raw lets a hostile issue
inject ANSI escapes, OSC sequences (terminal title spoofing), control
characters, or Trojan-Source bidi overrides directly into the user's
terminal, potentially hiding or rewriting the `warnings`/`why` lines.

JSON output is already safe (structured data, no terminal interpretation),
so it is explicitly out of scope. `repoLabel` (owner/name) is already
validated input and does not need sanitizing.

## Consequences

- the table renderers stay pure (strings in, strings out) and gain one small
  internal dependency on `sanitize.ts`
- output remains deterministic: same line structure, same ordering
- any future terminal-facing renderer should reuse `sanitizeForTerminal`
  for externally-sourced fields rather than re-inventing the stripping logic
