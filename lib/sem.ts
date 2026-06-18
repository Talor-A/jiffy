import { runToSchemaWithStdin, succeeds } from "./exec";
import { SemDiffSchema, type SemDiff } from "./schema";

let semAvailable: boolean | null = null;

/**
 * Semantic diff via the `sem` CLI. Pipes a git-format patch (from jj) on
 * stdin; degrades to `null` when `sem` is missing, disabled, or errors.
 */
export async function semDiffFromPatch(
  patch: string,
  cwd: string,
): Promise<SemDiff | null> {
  if (process.env.JIFFY_SEM === "0" || patch.trim().length === 0) {
    return null;
  }
  if (semAvailable === false) return null;
  if (semAvailable === null) {
    semAvailable = await succeeds(["sem", "--version"], cwd);
    if (!semAvailable) return null;
  }
  try {
    return await runToSchemaWithStdin(
      SemDiffSchema,
      ["sem", "diff", "--patch", "--format", "json", "-C", cwd],
      cwd,
      patch,
    );
  } catch {
    return null;
  }
}
