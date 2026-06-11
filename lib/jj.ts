import { join } from "node:path";
import {
  BookmarkRowSchema,
  ChangeInfoSchema,
  parseJsonLines,
  type BookmarkRow,
  type ChangeInfo,
} from "./schema";
import { run } from "./exec";

export const JIFFY_JJ_CONFIG = join(import.meta.dirname, "../config.toml");

/**
 * jj template rendering one {@link ChangeInfo} JSON object per line.
 * `json()` can't serialize mapped lists in jj 0.41, so arrays are assembled
 * by hand from per-element `json()` calls (verified against jj 0.41.0).
 */
export const CHANGE_TEMPLATE = [
  `"{"`,
  `++ "\\"changeId\\":" ++ json(change_id)`,
  `++ ",\\"changeIdPrefix\\":" ++ json(change_id.shortest(8).prefix())`,
  `++ ",\\"commitId\\":" ++ json(commit_id)`,
  `++ ",\\"commitIdPrefix\\":" ++ json(commit_id.shortest(8).prefix())`,
  `++ ",\\"description\\":" ++ json(description)`,
  `++ ",\\"empty\\":" ++ json(empty)`,
  `++ ",\\"immutable\\":" ++ json(immutable)`,
  `++ ",\\"isWorkingCopy\\":" ++ json(current_working_copy)`,
  `++ ",\\"parents\\":[" ++ parents.map(|p| json(p.change_id())).join(",") ++ "]"`,
  `++ ",\\"localBookmarks\\":[" ++ local_bookmarks.map(|b| json(b.name())).join(",") ++ "]"`,
  `++ ",\\"remoteBookmarks\\":[" ++ remote_bookmarks.map(|b| "{\\"name\\":" ++ json(b.name()) ++ ",\\"remote\\":" ++ json(b.remote()) ++ "}").join(",") ++ "]"`,
  `++ ",\\"authorName\\":" ++ json(author.name())`,
  `++ ",\\"timestamp\\":" ++ json(committer.timestamp())`,
  `++ "}\\n"`,
].join(" ");

export interface JjRunOptions {
  /**
   * Snapshot the working copy before running. Defaults to false: every read
   * passes `--ignore-working-copy` so a viewer polling in the background
   * never races an agent's jj commands for the working-copy lock or spams
   * the op log. Pass true for queries that must see live file edits.
   */
  snapshot?: boolean;
}

/**
 * Does a revset reference the working copy (`@`, `@-`, `closest_bookmark(@)`)?
 * Remote refs like `main@origin` don't count: their `@` is followed by a word
 * character (the remote name). False positives are harmless (one extra
 * snapshot).
 */
export function revsetTouchesWorkingCopy(revset: string): boolean {
  return /@(?!\w)/.test(revset);
}

/** Typed interface to one jj workspace. All output is zod-validated. */
export class Jj {
  constructor(
    readonly cwd: string,
    readonly configFile: string = JIFFY_JJ_CONFIG,
  ) {}

  async run(args: string[], opts: JjRunOptions = {}): Promise<string> {
    const argv = [
      "jj",
      "--config-file",
      this.configFile,
      "--color=never",
      "--no-pager",
      ...(opts.snapshot ? [] : ["--ignore-working-copy"]),
      ...args,
    ];
    return run(argv, this.cwd);
  }

  /** Workspace root, or null when cwd is not inside a jj repo. */
  static async findRoot(cwd: string): Promise<string | null> {
    try {
      const stdout = await run(["jj", "--ignore-working-copy", "root"], cwd);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /** `jj log` over `revset`, newest-first, parsed into {@link ChangeInfo}s. */
  async log(revset: string, opts: JjRunOptions = {}): Promise<ChangeInfo[]> {
    const stdout = await this.run(
      ["log", "--no-graph", "-r", revset, "-T", CHANGE_TEMPLATE],
      opts,
    );
    return parseJsonLines(ChangeInfoSchema, stdout);
  }

  /**
   * Resolve a revset expected to name at most one revision.
   * Returns null when it resolves to nothing.
   */
  async resolve(
    revset: string,
    opts: JjRunOptions = {},
  ): Promise<ChangeInfo | null> {
    const changes = await this.log(`latest(${revset})`, opts);
    return changes[0] ?? null;
  }

  /** All bookmarks, local and remote, one row per (name, remote) pair. */
  async bookmarks(): Promise<BookmarkRow[]> {
    const stdout = await this.run([
      "bookmark",
      "list",
      "-a",
      "-T",
      'json(self) ++ "\\n"',
    ]);
    return parseJsonLines(BookmarkRowSchema, stdout);
  }

  /**
   * Name of the trunk bookmark (e.g. "main"). Falls back to the literal
   * revset "root()" when trunk() resolves to the unbookmarked root commit
   * (fresh repo with no remote).
   */
  async trunkName(): Promise<string> {
    const stdout = await this.run([
      "bookmark",
      "list",
      "-r",
      "trunk()",
      "-T",
      'name ++ "\\n"',
    ]);
    return stdout.split("\n")[0]?.trim() || "root()";
  }

  /** `jj diff --git` for a single revision (its parents -> itself). */
  async diffChange(revset: string): Promise<string> {
    return this.run(["diff", "--git", "-r", revset], {
      snapshot: revsetTouchesWorkingCopy(revset),
    });
  }

  /** `jj diff --git` across an arbitrary range. */
  async diffRange(from: string, to: string): Promise<string> {
    return this.run(["diff", "--git", "--from", from, "--to", to], {
      snapshot: revsetTouchesWorkingCopy(from) || revsetTouchesWorkingCopy(to),
    });
  }

  /** Set a change's description (snapshots so describing `@` keeps edits). */
  async describe(changeId: string, message: string): Promise<void> {
    await this.run(["describe", "-r", changeId, "-m", message], {
      snapshot: true,
    });
  }

  /** Snapshot the working copy so subsequent reads see live file edits. */
  async snapshot(): Promise<void> {
    await this.run(["log", "-r", "@", "-n", "1", "-T", "change_id"], {
      snapshot: true,
    });
  }

  /**
   * Id of the latest operation. Changes whenever anything happens in the
   * repo (commits, description edits, fetches, snapshots) — cheap change
   * detection
   * for live reload.
   */
  async opHeadId(): Promise<string> {
    const stdout = await this.run([
      "op",
      "log",
      "-n",
      "1",
      "--no-graph",
      "-T",
      "id.short(16)",
    ]);
    return stdout.trim();
  }
}
