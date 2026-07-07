import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { CommentStore } from "../lib/comments";
import { createServer } from "../lib/server";
import { RepoInfoSchema } from "../lib/schema";
import { TestRepo } from "./fixtures";

let cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function reviewFixture(reviewMode: boolean) {
  const repo = await TestRepo.create();
  await repo.seedTrunk();
  const store = new CommentStore(
    join(repo.dir, ".jj", "jiffy", "comments.json"),
  );
  const { server, watcher, review } = createServer(
    { jj: repo.jj, store, github: async () => null },
    { port: 0, reviewMode },
  );
  cleanups.push(async () => {
    watcher.stop();
    await server.stop(true);
    await repo.cleanup();
  });
  const url = (p: string) => `http://localhost:${server.port}${p}`;
  const post = (body: unknown) =>
    fetch(url("/api/review"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { repo, store, server, review, url, post };
}

describe("review mode", () => {
  test("/api/repo reports reviewMode", async () => {
    const on = await reviewFixture(true);
    const info = RepoInfoSchema.parse(
      await (await fetch(on.url("/api/repo"))).json(),
    );
    expect(info.reviewMode).toBe(true);

    const off = await reviewFixture(false);
    const infoOff = RepoInfoSchema.parse(
      await (await fetch(off.url("/api/repo"))).json(),
    );
    expect(infoOff.reviewMode).toBe(false);
  }, 30_000);

  test("approve resolves the review promise with no markdown", async () => {
    const f = await reviewFixture(true);
    const res = await f.post({ verdict: "approve" });
    expect(res.status).toBe(200);
    const result = await f.review!;
    expect(result.verdict).toBe("approve");
    expect(result.markdown).toBe("");
  }, 30_000);

  test("request-changes resolves with the exported comments", async () => {
    const f = await reviewFixture(true);
    await f.store.add({
      specKey: "segment:@",
      specLabel: "local changes",
      file: "a.txt",
      side: "additions",
      line: 1,
      codeLine: "alpha",
      text: "rename this",
    });
    const res = await f.post({ verdict: "request-changes" });
    expect(res.status).toBe(200);
    const result = await f.review!;
    expect(result.verdict).toBe("request-changes");
    expect(result.count).toBe(1);
    expect(result.markdown).toContain("a.txt:1");
    expect(result.markdown).toContain("> rename this");
  }, 30_000);

  test("second verdict is rejected with 409", async () => {
    const f = await reviewFixture(true);
    expect((await f.post({ verdict: "approve" })).status).toBe(200);
    expect((await f.post({ verdict: "approve" })).status).toBe(409);
  }, 30_000);

  test("route 404s outside review mode; bad verdict 400s", async () => {
    const off = await reviewFixture(false);
    expect((await off.post({ verdict: "approve" })).status).toBe(404);
    const on = await reviewFixture(true);
    expect((await on.post({ verdict: "ship-it" })).status).toBe(400);
  }, 30_000);
});
