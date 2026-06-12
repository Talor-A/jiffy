import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Server } from "bun";
import { CommentStore } from "../lib/comments";
import { createServer, type RepoWatcher } from "../lib/server";
import { TestRepo } from "./fixtures";

let cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

describe("/api/actions jj mutations", () => {
  test("abandons a mutable change", async () => {
    const { repo, post } = await actionFixture();
    await repo.write("a.txt", "alpha\n");
    await repo.commit("add alpha");
    const source = await repo.jj.resolve("@-");
    expect(source).not.toBeNull();

    const res = await post({ action: "abandon", changeIds: [source!.changeId] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const remaining = await repo.jj.log("trunk()..@");
    expect(remaining.map((change) => change.changeId)).not.toContain(
      source!.changeId,
    );
  }, 30_000);

  test("squashes a change into its parent without opening an editor", async () => {
    const { repo, post } = await actionFixture();
    await repo.write("a.txt", "alpha\n");
    await repo.commit("add alpha");
    await repo.write("b.txt", "bravo\n");
    await repo.commit("add bravo");
    const source = await repo.jj.resolve("@-");
    expect(source?.description).toStartWith("add bravo");
    const parentId = source!.parents[0]!;

    const res = await post({
      action: "squash",
      fromChangeId: source!.changeId,
      useDestinationMessage: true,
    });
    expect(res.status).toBe(200);

    const remaining = await repo.jj.log("trunk()..@");
    expect(remaining.map((change) => change.changeId)).not.toContain(
      source!.changeId,
    );
    const parentDiff = await repo.jj.diffChange(parentId);
    expect(parentDiff).toContain("b.txt");
    const parent = await repo.jj.resolve(parentId);
    expect(parent?.description).toStartWith("add alpha");
  }, 30_000);

  test("squashes a change into an explicit non-parent destination", async () => {
    const { repo, post } = await actionFixture();
    await repo.write("a.txt", "alpha\n");
    await repo.commit("add alpha");
    await repo.write("b.txt", "bravo\n");
    await repo.commit("add bravo");
    await repo.write("c.txt", "charlie\n");
    await repo.commit("add charlie");
    const source = await repo.jj.resolve("@-");
    const destination = await repo.jj.resolve("@---");
    expect(source?.description).toStartWith("add charlie");
    expect(destination?.description).toStartWith("add alpha");

    const res = await post({
      action: "squash",
      fromChangeId: source!.changeId,
      intoChangeId: destination!.changeId,
      useDestinationMessage: true,
    });
    expect(res.status).toBe(200);

    const remaining = await repo.jj.log("trunk()..@");
    expect(remaining.map((change) => change.changeId)).not.toContain(
      source!.changeId,
    );
    const destinationDiff = await repo.jj.diffChange(destination!.changeId);
    expect(destinationDiff).toContain("a.txt");
    expect(destinationDiff).toContain("c.txt");
    const after = await repo.jj.resolve(destination!.changeId);
    expect(after?.description).toStartWith("add alpha");
  }, 30_000);

  test("absorbs working-copy edits into mutable ancestors", async () => {
    const { repo, post } = await actionFixture();
    await repo.write("a.txt", "alpha\n");
    await repo.commit("add alpha");
    await repo.write("a.txt", "alpha updated\n");
    const source = await repo.jj.resolve("@", { snapshot: true });

    const res = await post({ action: "absorb", changeId: source!.changeId });
    expect(res.status).toBe(200);

    const parentDiff = await repo.jj.diffChange("@-");
    expect(parentDiff).toContain("+alpha updated");
  }, 30_000);

  test("rejects immutable mutation sources", async () => {
    const { post } = await actionFixture();
    const res = await post({ action: "abandon", changeIds: ["main"] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("immutable");
  }, 30_000);
});

async function actionFixture(): Promise<{
  repo: TestRepo;
  server: Server<unknown>;
  watcher: RepoWatcher;
  post: (body: unknown) => Promise<Response>;
}> {
  const repo = await TestRepo.create();
  await repo.seedTrunk();
  const store = new CommentStore(join(repo.dir, ".jj", "jiffy", "comments.json"));
  const { server, watcher } = createServer(
    { jj: repo.jj, store, github: async () => null },
    { port: 0 },
  );
  cleanups.push(async () => {
    watcher.stop();
    await server.stop(true);
    await repo.cleanup();
  });
  const url = (path: string) => `http://localhost:${server.port}${path}`;
  return {
    repo,
    server,
    watcher,
    post: (body: unknown) =>
      fetch(url("/api/actions"), { method: "POST", body: JSON.stringify(body) }),
  };
}
