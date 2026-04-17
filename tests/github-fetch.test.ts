import { describe, it, expect, vi, beforeEach } from "vitest"

import { fetchOrgRepositories, fetchIssueComments, checkContributingMd } from "../src/github/fetch.js"

// --- Comment helpers ---

interface FakeComment {
  user: { login: string; type: string } | null
  body: string | null
  created_at: string
}

function makeComment(created_at: string, overrides: Partial<FakeComment> = {}): FakeComment {
  return {
    user: { login: "alice", type: "User" },
    body: "a comment",
    created_at,
    ...overrides,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCommentClient(listComments: ReturnType<typeof vi.fn>): any {
  return { rest: { issues: { listComments } } }
}

// --- Org repo helpers ---

interface FakeOrgRepo {
  name: string
  fork: boolean
  archived: boolean
  disabled: boolean
  owner: { login: string }
}

function makeOrgRepo(overrides: Partial<FakeOrgRepo> = {}): FakeOrgRepo {
  return {
    name: overrides.name ?? "some-repo",
    fork: overrides.fork ?? false,
    archived: overrides.archived ?? false,
    disabled: overrides.disabled ?? false,
    owner: overrides.owner ?? { login: "acme" },
  }
}

function makeFullPage(startIndex: number, count = 100): FakeOrgRepo[] {
  return Array.from({ length: count }, (_, i) =>
    makeOrgRepo({ name: `repo-${startIndex + i}` })
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFakeClient(listForOrg: ReturnType<typeof vi.fn>): any {
  return { rest: { repos: { listForOrg } } }
}

const ORG = "acme"

// --- Tests ---

describe("fetchOrgRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // === API call parameters ===

  it("calls listForOrg with correct parameters on page 1", async () => {
    const listForOrg = vi.fn().mockResolvedValue({ data: [] })

    await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(listForOrg).toHaveBeenCalledWith({
      org: ORG,
      type: "public",
      sort: "pushed",
      direction: "desc",
      per_page: 100,
      page: 1,
    })
  })

  // === Filtering ===

  it("filters out fork repos", async () => {
    const listForOrg = vi.fn().mockResolvedValue({
      data: [
        makeOrgRepo({ name: "real-repo", fork: false }),
        makeOrgRepo({ name: "forked-repo", fork: true }),
      ],
    })

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("real-repo")
  })

  it("filters out archived repos", async () => {
    const listForOrg = vi.fn().mockResolvedValue({
      data: [
        makeOrgRepo({ name: "active-repo", archived: false }),
        makeOrgRepo({ name: "archived-repo", archived: true }),
      ],
    })

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("active-repo")
  })

  it("filters out disabled repos", async () => {
    const listForOrg = vi.fn().mockResolvedValue({
      data: [
        makeOrgRepo({ name: "enabled-repo", disabled: false }),
        makeOrgRepo({ name: "disabled-repo", disabled: true }),
      ],
    })

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("enabled-repo")
  })

  it("applies all three filters independently", async () => {
    const listForOrg = vi.fn().mockResolvedValue({
      data: [
        makeOrgRepo({ name: "good-repo" }),
        makeOrgRepo({ name: "fork-repo", fork: true }),
        makeOrgRepo({ name: "archived-repo", archived: true }),
        makeOrgRepo({ name: "disabled-repo", disabled: true }),
      ],
    })

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("good-repo")
  })

  it("maps owner.login and name into OrgRepoInfo", async () => {
    const listForOrg = vi.fn().mockResolvedValue({
      data: [makeOrgRepo({ name: "my-repo", owner: { login: "org-owner" } })],
    })

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(result[0]).toEqual({ owner: "org-owner", name: "my-repo" })
  })

  // === Pagination ===

  it("stops after the first page when it returns fewer than 100 repos", async () => {
    const listForOrg = vi.fn().mockResolvedValue({
      data: makeFullPage(0, 42), // 42 < 100 → stop immediately
    })

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(listForOrg).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(42)
  })

  it("paginates until a page returns fewer than 100 repos", async () => {
    const listForOrg = vi.fn()
      .mockResolvedValueOnce({ data: makeFullPage(0) })    // page 1: 100 → continue
      .mockResolvedValueOnce({ data: makeFullPage(100, 37) }) // page 2: 37 < 100 → stop

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(listForOrg).toHaveBeenCalledTimes(2)
    expect(listForOrg).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1 }))
    expect(listForOrg).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }))
    expect(result).toHaveLength(137)
  })

  // === Safety cap ===

  it("stops at the 5-page safety cap when every page is full", async () => {
    const listForOrg = vi.fn().mockResolvedValue({ data: makeFullPage(0) }) // always 100

    const result = await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    expect(listForOrg).toHaveBeenCalledTimes(5)
    expect(result).toHaveLength(500)
  })

  it("does not request a 6th page when the safety cap is reached", async () => {
    const listForOrg = vi.fn().mockResolvedValue({ data: makeFullPage(0) })

    await fetchOrgRepositories(makeFakeClient(listForOrg), ORG)

    const pageNumbers = listForOrg.mock.calls.map(
      (call) => (call[0] as { page: number }).page
    )
    expect(Math.max(...pageNumbers)).toBe(5)
    expect(pageNumbers.includes(6)).toBe(false)
  })
})

// --- CONTRIBUTING.md check helpers ---

interface FakeTreeItem {
  path?: string
  type?: string
}

function makeContributingClient(
  get: ReturnType<typeof vi.fn>,
  getTree: ReturnType<typeof vi.fn>,
  getContent?: ReturnType<typeof vi.fn>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    rest: {
      repos: { get, getContent: getContent ?? vi.fn() },
      git: { getTree },
    },
  }
}

function makeTreeResponse(items: FakeTreeItem[]) {
  return { data: { tree: items } }
}

// A 404-shaped error that wrapOctokitCall will convert to GitHubApiError(status: 404)
const FAKE_404 = {
  status: 404,
  message: "Not Found",
  response: { headers: {}, data: { message: "Not Found" } },
}

// --- Tests ---

describe("checkContributingMd", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns true when root tree contains CONTRIBUTING.md", async () => {
    const get = vi.fn().mockResolvedValue({ data: { default_branch: "main" } })
    const getTree = vi.fn().mockResolvedValue(
      makeTreeResponse([{ path: "CONTRIBUTING.md", type: "blob" }])
    )
    const result = await checkContributingMd(makeContributingClient(get, getTree), "owner", "repo")
    expect(result).toBe(true)
  })

  it("returns true case-insensitively for contributing.md", async () => {
    const get = vi.fn().mockResolvedValue({ data: { default_branch: "main" } })
    const getTree = vi.fn().mockResolvedValue(
      makeTreeResponse([{ path: "contributing.md", type: "blob" }])
    )
    const result = await checkContributingMd(makeContributingClient(get, getTree), "owner", "repo")
    expect(result).toBe(true)
  })

  it("returns false when root tree does not contain CONTRIBUTING.md", async () => {
    const get = vi.fn().mockResolvedValue({ data: { default_branch: "main" } })
    const getTree = vi.fn().mockResolvedValue(
      makeTreeResponse([
        { path: "README.md", type: "blob" },
        { path: "src", type: "tree" },
      ])
    )
    const result = await checkContributingMd(makeContributingClient(get, getTree), "owner", "repo")
    expect(result).toBe(false)
  })

  it("returns false on GitHubApiError 404", async () => {
    const get = vi.fn().mockRejectedValue(FAKE_404)
    const getTree = vi.fn()
    const result = await checkContributingMd(makeContributingClient(get, getTree), "owner", "repo")
    expect(result).toBe(false)
  })

  it("does not call repos.getContent", async () => {
    const get = vi.fn().mockResolvedValue({ data: { default_branch: "main" } })
    const getTree = vi.fn().mockResolvedValue(makeTreeResponse([]))
    const getContent = vi.fn()
    await checkContributingMd(makeContributingClient(get, getTree, getContent), "owner", "repo")
    expect(getContent).not.toHaveBeenCalled()
  })
})

describe("fetchIssueComments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // === API call parameters ===

  it("calls listComments with correct params including page — no sort or direction", async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] })

    await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 42)

    expect(listComments).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 42,
      per_page: 100,
      page: 1,
    })
    expect(listComments.mock.calls[0][0]).not.toHaveProperty("sort")
    expect(listComments.mock.calls[0][0]).not.toHaveProperty("direction")
  })

  // === Client-side sort ===

  it("sorts comments newest-first regardless of API response order", async () => {
    const old    = makeComment("2026-01-01T00:00:00Z", { body: "oldest" })
    const middle = makeComment("2026-02-01T00:00:00Z", { body: "middle" })
    const recent = makeComment("2026-03-01T00:00:00Z", { body: "newest" })

    // API returns oldest-first (ascending) — client must reorder
    const listComments = vi.fn().mockResolvedValue({ data: [old, middle, recent] })

    const result = await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 1)

    expect(result[0].body).toBe("newest")
    expect(result[1].body).toBe("middle")
    expect(result[2].body).toBe("oldest")
  })

  it("does not rely on API sort — produces newest-first from shuffled input", async () => {
    const a = makeComment("2026-03-15T10:00:00Z", { body: "c" })
    const b = makeComment("2026-01-10T08:00:00Z", { body: "a" })
    const c = makeComment("2026-04-01T12:00:00Z", { body: "d" })
    const d = makeComment("2026-02-20T09:00:00Z", { body: "b" })

    const listComments = vi.fn().mockResolvedValue({ data: [a, b, c, d] })

    const result = await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 5)

    const dates = result.map((r) => r.createdAt)
    expect(dates).toEqual([...dates].sort((x, y) => y.localeCompare(x)))
    expect(result[0].body).toBe("d") // 2026-04-01 is most recent
  })

  // === Empty list ===

  it("returns an empty array when there are no comments", async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] })

    const result = await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 7)

    expect(result).toEqual([])
  })

  // === Pagination ===

  it("stops after page 1 when fewer than 100 comments are returned", async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [makeComment("2026-01-01T00:00:00Z")],
    })

    await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 1)

    expect(listComments).toHaveBeenCalledTimes(1)
  })

  it("surfaces newer comment from page 2 when issue has more than 100 comments", async () => {
    // Page 1: 100 old comments spaced 1 hour apart from 2026-01-01 (all valid ISO dates)
    const page1 = Array.from({ length: 100 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 3_600_000) // +i hours
      return makeComment(date.toISOString(), { body: `old-${i}` })
    })
    // Page 2: 1 newer comment — would be missed if only page 1 was fetched
    const page2 = [makeComment("2026-04-10T00:00:00Z", { body: "newest-on-page-2" })]

    const listComments = vi.fn()
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 })

    const result = await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 1)

    expect(listComments).toHaveBeenCalledTimes(2)
    expect(result[0].body).toBe("newest-on-page-2")
  })

  it("stops at the 3-page safety cap when every page is full", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 3_600_000)
      return makeComment(date.toISOString())
    })
    const listComments = vi.fn().mockResolvedValue({ data: fullPage })

    await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 1)

    expect(listComments).toHaveBeenCalledTimes(3)
  })

  // === Mapping ===

  it("maps comment fields to GitHubCommentSummary correctly", async () => {
    const comment = makeComment("2026-04-10T00:00:00Z", {
      user: { login: "bob", type: "User" },
      body: "hello world",
    })
    const listComments = vi.fn().mockResolvedValue({ data: [comment] })

    const result = await fetchIssueComments(makeCommentClient(listComments), "owner", "repo", 10)

    expect(result[0]).toEqual({
      authorLogin: "bob",
      authorType: "user",
      body: "hello world",
      createdAt: "2026-04-10T00:00:00Z",
    })
  })
})
