import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { revsetTouchesWorkingCopy } from "../lib/jj";
import { BookmarkRowSchema, parseJsonLines } from "../lib/schema";
import { TestRepo } from "./fixtures";

describe("revsetTouchesWorkingCopy", () => {
  test("matches working-copy revsets", () => {
    expect(revsetTouchesWorkingCopy("@")).toBe(true);
    expect(revsetTouchesWorkingCopy("@-")).toBe(true);
    expect(revsetTouchesWorkingCopy("closest_bookmark(@)")).toBe(true);
    expect(revsetTouchesWorkingCopy("trunk()..@")).toBe(true);
  });
  test("ignores remote refs and plain revsets", () => {
    expect(revsetTouchesWorkingCopy("main@origin")).toBe(false);
    expect(revsetTouchesWorkingCopy("trunk()")).toBe(false);
    expect(revsetTouchesWorkingCopy("xyzkwpql")).toBe(false);
  });
});

describe("BookmarkRowSchema", () => {
  test("parses deleted bookmark rows with null targets", () => {
    const rows = parseJsonLines(
      BookmarkRowSchema,
      [
        JSON.stringify({
          name: "deleted-feature",
          target: [null],
        }),
        JSON.stringify({
          name: "main",
          remote: "origin",
          target: ["1ca273dba559521f6f71d3505fef03d9b7bdb513"],
        }),
      ].join("\n"),
    );

    expect(rows[0]!.target).toEqual([null]);
    expect(rows[1]!.target).toEqual([
      "1ca273dba559521f6f71d3505fef03d9b7bdb513",
    ]);
  });
});

describe("Jj against a real repo", () => {
  let repo: TestRepo;

  beforeAll(async () => {
    repo = await TestRepo.create();
    await repo.seedTrunk();
    // Build a small stack: feat-a (bookmarked, 1 change) then two
    // unbookmarked changes on top, the topmost being the working copy.
    await repo.write("a.txt", "alpha\n");
    await repo.commit("feat-a: add alpha");
    await repo.bookmark("feat-a");
    await repo.write("b.txt", "bravo\n");
    await repo.describe("wip: add bravo");
    await repo.jjRaw(["new"]);
  }, 30_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  test("findRoot resolves inside the repo and rejects outside", async () => {
    const { Jj } = await import("../lib/jj");
    expect(await Jj.findRoot(repo.dir)).toBe(repo.dir);
    expect(await Jj.findRoot("/tmp")).toBeNull();
  });

  test("log parses the full stack with bookmarks and flags", async () => {
    const changes = await repo.jj.log("trunk()..@");
    expect(changes).toHaveLength(3);

    const [wc, wip, feat] = changes;
    expect(wc!.isWorkingCopy).toBe(true);
    expect(wc!.empty).toBe(true);
    expect(wc!.description).toBe("");

    expect(wip!.description).toStartWith("wip: add bravo");
    expect(wip!.parents).toEqual([feat!.changeId]);

    expect(feat!.localBookmarks).toEqual(["feat-a"]);
    expect(feat!.immutable).toBe(false);
  });

  test("log includes shortest unique id prefixes", async () => {
    const changes = await repo.jj.log("trunk()..@");
    for (const change of changes) {
      expect(change.changeId.startsWith(change.changeIdPrefix)).toBe(true);
      expect(change.changeIdPrefix.length).toBeGreaterThan(0);
      expect(change.changeIdPrefix.length).toBeLessThan(change.changeId.length);
      expect(change.commitId.startsWith(change.commitIdPrefix)).toBe(true);
    }
  });

  test("trunkName finds main", async () => {
    expect(await repo.jj.trunkName()).toBe("main");
  });

  test("bookmarks lists local and origin rows", async () => {
    const rows = await repo.jj.bookmarks();
    const main = rows.filter((r) => r.name === "main");
    expect(main.some((r) => !r.remote)).toBe(true);
    expect(main.some((r) => r.remote === "origin")).toBe(true);
    const featA = rows.filter((r) => r.name === "feat-a");
    expect(featA.some((r) => r.remote === "origin")).toBe(false);
  });

  test("resolve closest_bookmark and closest_pushable aliases", async () => {
    const bookmark = await repo.jj.resolve("closest_bookmark(@)");
    expect(bookmark?.localBookmarks).toEqual(["feat-a"]);

    // closest_pushable skips the empty @ and lands on the described change.
    const pushable = await repo.jj.resolve("closest_pushable(@)");
    expect(pushable?.description).toStartWith("wip: add bravo");
  });

  test("resolve returns null for an empty revset", async () => {
    expect(await repo.jj.resolve("none()")).toBeNull();
  });

  test("diffChange returns a git-format patch", async () => {
    const patch = await repo.jj.diffChange("closest_pushable(@)");
    expect(patch).toContain("diff --git a/b.txt b/b.txt");
    expect(patch).toContain("+bravo");
  });

  test("diffRange spans multiple changes", async () => {
    const patch = await repo.jj.diffRange("main", "@");
    expect(patch).toContain("diff --git a/a.txt b/a.txt");
    expect(patch).toContain("diff --git a/b.txt b/b.txt");
  });

  test("diff with @ sees live working-copy edits (snapshot)", async () => {
    await repo.write("live.txt", "fresh edit\n");
    const patch = await repo.jj.diffChange("@");
    expect(patch).toContain("diff --git a/live.txt b/live.txt");
  });

  test("opHeadId changes when the repo changes", async () => {
    const before = await repo.jj.opHeadId();
    await repo.describe("op log test", "@");
    const after = await repo.jj.opHeadId();
    expect(after).not.toBe(before);
    expect(before).toMatch(/^[0-9a-f]{16}$/);
  });
});
