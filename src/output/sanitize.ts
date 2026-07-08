// Strips terminal-hostile sequences from untrusted, externally-sourced text
// (issue titles, labels, etc.) before it is printed to the terminal.
// JSON output is unaffected -- this module is only used by table renderers.

const OSC_RE = /\x1B\][\s\S]*?(?:\x07|\x1B\\)/g
const ANSI_RE = /\x1B\[[0-9;?]*[ -/]*[@-~]/g
const CONTROL_RE = /[\x00-\x1F\x7F-\x9F]/g
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g

export function sanitizeForTerminal(s: string): string {
  return s.replace(OSC_RE, "").replace(ANSI_RE, "").replace(CONTROL_RE, "").replace(BIDI_RE, "")
}
