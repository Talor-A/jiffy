import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Server } from "bun";
import { CommentStore } from "../lib/comments";
import { createServer, type RepoWatcher } from "../lib/server";
import {
  CommentSchema,
  CommentListResponseSchema,
  DiffResponseSchema,
  ExportResponseSchema,
  RepoInfoSchema,
  StackViewSchema,
  type GithubContext,
} from "../lib/schema";
import { TestRepo } from "./fixtures";

const fakeGithub: GithubContext = {
  repo: { nameWithOwner: "ta/fixture", url: "https://github.com/ta/fixture" },
  pullRequests: [
    {
      number: 11,
      title: "feat-a PR",
      url: "https://github.com/ta/fixture/pull/11",
      state: "OPEN",
      isDraft: true,
      baseRefName: "main",
      headRefName: "feat-a",
    },
  ],
};

let repo: TestRepo;
let server: Server<unknown>;
let watcher: RepoWatcher;
let url: (path: string) => string;

beforeAll(async () => {
  repo = await TestRepo.create();
  await repo.seedTrunk();
  await repo.write("a.txt", "alpha\n");
  await repo.commit("feat-a: add alpha");
  await repo.bookmark("feat-a");
  await repo.write("b.txt", "bravo\n");
  await repo.describe("wip: add bravo");

  const store = new CommentStore(join(repo.dir, ".jj", "jiffy", "comments.json"));
  ({ server, watcher } = createServer(
    { jj: repo.jj, store, github: async () => fakeGithub },
    { port: 0 },
  ));
  url = (path) => `http://localhost:${server.port}${path}`;
}, 30_000);

afterAll(async () => {
  watcher.stop();
  await server.stop(true);
  await repo.cleanup();
});

describe("/api/repo", () => {
  test("returns root, trunk, and github info", async () => {
    const res = await fetch(url("/api/repo"));
    expect(res.status).toBe(200);
    const info = RepoInfoSchema.parse(await res.json());
    expect(info.root).toBe(repo.dir);
    expect(info.trunkName).toBe("main");
    expect(info.github?.nameWithOwner).toBe("ta/fixture");
  });
});

describe("/api/stack", () => {
  test("returns segments with PRs and push status", async () => {
    const res = await fetch(url("/api/stack?snapshot=1"));
    expect(res.status).toBe(200);
    const stack = StackViewSchema.parse(await res.json());

    expect(stack.trunkName).toBe("main");
    expect(stack.segments.map((s) => s.name)).toEqual([null, "feat-a"]);

    const anon = stack.segments[0]!;
    expect(anon.changes[0]!.isWorkingCopy).toBe(true);
    expect(anon.changes[0]!.description).toStartWith("wip: add bravo");

    const featA = stack.segments[1]!;
    expect(featA.pr?.number).toBe(11);
    expect(featA.pushStatus).toBe("unpushed");
    expect(stack.hasUnpushedWork).toBe(true);
  });
});

describe("/api/diff", () => {
  test("change mode resolves and returns a patch", async () => {
    const res = await fetch(url("/api/diff?change=closest_pushable(@)"));
    expect(res.status).toBe(200);
    const diff = DiffResponseSchema.parse(await res.json());
    expect(diff.change?.description).toStartWith("wip: add bravo");
    expect(diff.patch).toContain("+bravo");
    expect(diff.from).toBeNull();
  });

  test("range mode resolves both endpoints", async () => {
    const res = await fetch(url("/api/diff?from=main&to=@"));
    const diff = DiffResponseSchema.parse(await res.json());
    expect(diff.from?.description).toStartWith("initial commit");
    expect(diff.patch).toContain("a.txt");
    expect(diff.patch).toContain("b.txt");
  });

  test("rejects requests with neither change nor from/to", async () => {
    const res = await fetch(url("/api/diff?from=main"));
    expect(res.status).toBe(400);
  });

  test("bad revset surfaces a 400 with jj's message", async () => {
    const res = await fetch(url("/api/diff?change=bogus_fn(@)"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("empty revset is a 400, not a crash", async () => {
    const res = await fetch(url("/api/diff?change=none()"));
    expect(res.status).toBe(400);
  });
});

describe("comments API", () => {
  test("full lifecycle: create, list, patch, export, delete", async () => {
    const createRes = await fetch(url("/api/comments"), {
      method: "POST",
      body: JSON.stringify({
        specKey: "wc",
        specLabel: "Working copy",
        file: "b.txt",
        side: "additions",
        line: 1,
        codeLine: "bravo",
        text: "should this be beta?",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = CommentSchema.parse(await createRes.json());

    const listRes = await fetch(url("/api/comments?specKey=wc"));
    const list = CommentListResponseSchema.parse(await listRes.json());
    expect(list.comments.map((c) => c.id)).toContain(created.id);

    const patchRes = await fetch(url(`/api/comments/${created.id}`), {
      method: "PATCH",
      body: JSON.stringify({ text: "definitely beta" }),
    });
    expect(patchRes.status).toBe(200);

    const exportRes = await fetch(url("/api/export"));
    const exported = ExportResponseSchema.parse(await exportRes.json());
    expect(exported.count).toBeGreaterThan(0);
    expect(exported.markdown).toContain("b.txt:1");
    expect(exported.markdown).toContain("definitely beta");
    expect(exported.markdown).toContain("ta/fixture");

    const deleteRes = await fetch(url(`/api/comments/${created.id}`), {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    const afterDelete = CommentListResponseSchema.parse(
      await (await fetch(url("/api/comments"))).json(),
    );
    expect(afterDelete.comments.map((c) => c.id)).not.toContain(created.id);
  });

  test("rejects malformed comment input", async () => {
    const res = await fetch(url("/api/comments"), {
      method: "POST",
      body: JSON.stringify({ file: "x", text: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("misc", () => {
  test("unknown route 404s", async () => {
    const res = await fetch(url("/api/nope"));
    expect(res.status).toBe(404);
  });

  test("refresh snapshots and succeeds", async () => {
    const res = await fetch(url("/api/refresh"), { method: "POST" });
    expect(res.status).toBe(200);
  });

  test("events endpoint speaks SSE", async () => {
    const controller = new AbortController();
    const res = await fetch(url("/api/events"), { signal: controller.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain(": connected");
    controller.abort();
  });
});
