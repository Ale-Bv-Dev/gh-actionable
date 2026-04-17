import { describe, it, expect } from "vitest"

import { parseArgs, CliUsageError } from "../src/cli/args.js"

describe("parseArgs", () => {
  // --- Repo: happy path ---

  it("parses --repo owner/name", () => {
    expect(parseArgs(["--repo", "acme/widget"])).toEqual({
      mode: "repo",
      owner: "acme",
      name: "widget",
      json: false,
    })
  })

  it("parses --repo with --json flag", () => {
    expect(parseArgs(["--repo", "acme/widget", "--json"])).toEqual({
      mode: "repo",
      owner: "acme",
      name: "widget",
      json: true,
    })
  })

  it("parses --json before --repo", () => {
    expect(parseArgs(["--json", "--repo", "acme/widget"])).toEqual({
      mode: "repo",
      owner: "acme",
      name: "widget",
      json: true,
    })
  })

  // --- Org: happy path ---

  it("parses --org owner", () => {
    expect(parseArgs(["--org", "acme"])).toEqual({
      mode: "org",
      org: "acme",
      json: false,
    })
  })

  it("parses --org with --json flag", () => {
    expect(parseArgs(["--org", "acme", "--json"])).toEqual({
      mode: "org",
      org: "acme",
      json: true,
    })
  })

  it("parses --json before --org", () => {
    expect(parseArgs(["--json", "--org", "acme"])).toEqual({
      mode: "org",
      org: "acme",
      json: true,
    })
  })

  // --- No arguments ---

  it("throws CliUsageError when no arguments", () => {
    expect(() => parseArgs([])).toThrow(CliUsageError)
  })

  // --- No target ---

  it("throws CliUsageError when neither --repo nor --org is provided", () => {
    const err = () => parseArgs(["--json"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("--repo or --org is required")
  })

  // --- Mutually exclusive ---

  it("throws CliUsageError when both --repo and --org are provided", () => {
    const err = () => parseArgs(["--repo", "acme/widget", "--org", "acme"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("mutually exclusive")
  })

  // --- Invalid repo format ---

  it("throws CliUsageError when repo has no slash", () => {
    const err = () => parseArgs(["--repo", "acmewidget"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("invalid repo format")
  })

  it("throws CliUsageError when repo has trailing slash", () => {
    expect(() => parseArgs(["--repo", "acme/"])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when repo has leading slash", () => {
    expect(() => parseArgs(["--repo", "/widget"])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when repo has multiple slashes", () => {
    expect(() => parseArgs(["--repo", "acme/widget/extra"])).toThrow(CliUsageError)
  })

  // --- Invalid org format ---

  it("throws CliUsageError when --org value contains a slash", () => {
    const err = () => parseArgs(["--org", "acme/widget"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("without slash")
  })

  // --- Missing values ---

  it("throws CliUsageError when --repo has no value at end of argv", () => {
    const err = () => parseArgs(["--repo"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("requires a value")
  })

  it("throws CliUsageError when --repo is immediately followed by another flag", () => {
    const err = () => parseArgs(["--repo", "--json"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("requires a value")
  })

  it("throws CliUsageError when --org has no value at end of argv", () => {
    const err = () => parseArgs(["--org"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("requires a value")
  })

  it("throws CliUsageError when --org is immediately followed by another flag", () => {
    const err = () => parseArgs(["--org", "--json"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("requires a value")
  })

  // --- Unknown arguments ---

  it("throws CliUsageError for unknown flag", () => {
    const err = () => parseArgs(["--repo", "acme/widget", "--unknown"])
    expect(err).toThrow(CliUsageError)
    expect(err).toThrow("Unknown argument: --unknown")
  })

  it("throws CliUsageError for typo-like flag", () => {
    expect(() => parseArgs(["--repo", "acme/widget", "--jsonn"])).toThrow(CliUsageError)
  })

  // --- Segment validation ---

  it("throws CliUsageError when repo owner is ..", () => {
    expect(() => parseArgs(["--repo", "../name"])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when repo name is ..", () => {
    expect(() => parseArgs(["--repo", "owner/.."])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when repo owner contains whitespace", () => {
    expect(() => parseArgs(["--repo", "foo bar/name"])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when repo name contains whitespace", () => {
    expect(() => parseArgs(["--repo", "owner/foo bar"])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when org is ..", () => {
    expect(() => parseArgs(["--org", ".."])).toThrow(CliUsageError)
  })

  it("throws CliUsageError when org contains whitespace", () => {
    expect(() => parseArgs(["--org", "foo bar"])).toThrow(CliUsageError)
  })

  it("accepts valid repo segments with letters, numbers, dash, underscore, and dot", () => {
    expect(() => parseArgs(["--repo", "my-org/my.repo_1"])).not.toThrow()
  })

  it("accepts valid org with letters, numbers, dash, and underscore", () => {
    expect(() => parseArgs(["--org", "my-org_1"])).not.toThrow()
  })
})
