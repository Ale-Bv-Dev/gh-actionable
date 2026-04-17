import { resolveGitHubAuth } from "../github/auth.js"
import { createGitHubClient } from "../github/client.js"
import { scanWithCache } from "../cache/cache.js"
import { scanOrg } from "../org-scan.js"
import { renderTable } from "../output/render-table.js"
import { renderJson } from "../output/render-json.js"
import { renderOrgTable } from "../output/render-org-table.js"
import { renderOrgJson } from "../output/render-org-json.js"
import { parseArgs } from "./args.js"

export async function run(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv)
  const auth = await resolveGitHubAuth()
  const client = createGitHubClient({ auth })

  if (args.mode === "repo") {
    const result = await scanWithCache(client, { owner: args.owner, name: args.name })
    const output = args.json ? renderJson(result) : renderTable(result)
    process.stdout.write(output + "\n")
  } else {
    const result = await scanOrg(client, { org: args.org })
    const output = args.json ? renderOrgJson(result) : renderOrgTable(result)
    process.stdout.write(output + "\n")
  }
}
