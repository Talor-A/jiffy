import type { RepoInfo } from "../lib/schema";

function repoDisplayName(repo: RepoInfo): string {
  return repo.github?.nameWithOwner ?? repo.root.split("/").pop() ?? repo.root;
}

export function formatPageTitle(
  viewLabel: string,
  repo: RepoInfo | null,
): string {
  return [viewLabel, repo ? repoDisplayName(repo) : null, "jiffy"]
    .filter(Boolean)
    .join(" · ");
}
