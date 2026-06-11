import { z } from "zod";
import { runToSchema } from "./exec";
import {
  GhPullRequestSchema,
  GhRepoSchema,
  type GithubContext,
} from "./schema";

/**
 * GitHub context via the `gh` CLI. Everything here degrades gracefully:
 * if `gh` is missing, unauthenticated, or the repo has no GitHub remote,
 * jiffy still works — it just shows no PR links.
 */
export async function fetchGithubContext(
  cwd: string,
): Promise<GithubContext | null> {
  try {
    const [repo, pullRequests] = await Promise.all([
      runToSchema(
        GhRepoSchema,
        ["gh", "repo", "view", "--json", "nameWithOwner,url"],
        cwd,
      ),
      runToSchema(
        z.array(GhPullRequestSchema),
        [
          "gh",
          "pr",
          "list",
          "--state",
          "open",
          "--limit",
          "200",
          "--json",
          "number,title,url,state,isDraft,baseRefName,headRefName",
        ],
        cwd,
      ),
    ]);
    return { repo, pullRequests };
  } catch {
    return null;
  }
}
