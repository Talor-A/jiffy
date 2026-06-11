import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../lib/exec";
import { Jj, JIFFY_JJ_CONFIG } from "../lib/jj";

/**
 * Scripted jj repos for tests: a temp-dir jj repo with a deterministic
 * identity, optionally wired to a bare git "origin" so push-status and
 * trunk() behave like a real GitHub-backed repo.
 */
export class TestRepo {
  private constructor(
    readonly dir: string,
    readonly originDir: string,
    readonly jj: Jj,
  ) {}

  static async create(): Promise<TestRepo> {
    // realpath because macOS tmpdir is a symlink (/var -> /private/var) and
    // `jj root` reports the resolved path.
    const base = await realpath(await mkdtemp(join(tmpdir(), "jiffy-test-")));
    const dir = join(base, "repo");
    const originDir = join(base, "origin.git");

    await run(["git", "init", "--bare", originDir], base);
    await run(["jj", "git", "init", dir], base);

    const repo = new TestRepo(dir, originDir, new Jj(dir));
    // Deterministic identity, scoped to the repo so tests don't depend on
    // (or pollute) user config.
    await repo.jjRaw(["config", "set", "--repo", "user.name", "Jiffy Test"]);
    await repo.jjRaw(["config", "set", "--repo", "user.email", "test@jiffy.local"]);
    await repo.jjRaw(["git", "remote", "add", "origin", originDir]);
    return repo;
  }

  /** Run jj with working-copy snapshotting (for mutations). */
  async jjRaw(args: string[]): Promise<string> {
    return run(
      ["jj", "--config-file", JIFFY_JJ_CONFIG, "--color=never", "--no-pager", ...args],
      this.dir,
    );
  }

  async write(relPath: string, content: string): Promise<void> {
    await Bun.write(join(this.dir, relPath), content);
  }

  /** Describe @ and start a new change on top (classic jj flow). */
  async commit(message: string): Promise<void> {
    await this.jjRaw(["commit", "-m", message]);
  }

  async describe(message: string, rev = "@"): Promise<void> {
    await this.jjRaw(["describe", "-r", rev, "-m", message]);
  }

  async bookmark(name: string, rev = "@-"): Promise<void> {
    await this.jjRaw(["bookmark", "create", name, "-r", rev]);
  }

  async push(bookmark: string): Promise<void> {
    await this.jjRaw(["git", "push", "--allow-new", "-b", bookmark]);
  }

  /**
   * Standard starting point: an initial commit on `main`, pushed to origin
   * so `trunk()` resolves to main@origin and immutability works like prod.
   */
  async seedTrunk(): Promise<void> {
    await this.write("README.md", "# fixture\n");
    await this.commit("initial commit");
    await this.bookmark("main");
    await this.push("main");
  }

  async cleanup(): Promise<void> {
    await rm(join(this.dir, ".."), { recursive: true, force: true });
  }
}
