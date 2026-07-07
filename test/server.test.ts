import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Server } from "bun";
import { CommentStore } from "../lib/comments";

import { createServer, RepoWatcher } from "../lib/server";
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

  test("range comment round-trips endLine and exports a span", async () => {
    const createRes = await fetch(url("/api/comments"), {
      method: "POST",
      body: JSON.stringify({
        specKey: "wc",
        specLabel: "Working copy",
        file: "b.txt",
        side: "additions",
        line: 1,
        endLine: 3,
        codeLine: "bravo\ncharlie\ndelta",
        text: "tighten this block",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = CommentSchema.parse(await createRes.json());
    expect(created.endLine).toBe(3);

    const list = CommentListResponseSchema.parse(
      await (await fetch(url("/api/comments?specKey=wc"))).json(),
    );
    expect(list.comments.find((c) => c.id === created.id)?.endLine).toBe(3);

    const exported = ExportResponseSchema.parse(
      await (await fetch(url("/api/export"))).json(),
    );
    expect(exported.markdown).toContain("b.txt:1-3");
    expect(exported.markdown).toContain("  bravo\n  charlie\n  delta");

    const deleteRes = await fetch(url(`/api/comments/${created.id}`), {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
  });

  test("rejects malformed comment input", async () => {
    const res = await fetch(url("/api/comments"), {
      method: "POST",
      body: JSON.stringify({ file: "x", text: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/actions", () => {
  const post = (body: unknown) =>
    fetch(url("/api/actions"), { method: "POST", body: JSON.stringify(body) });

  test("describe updates a change's description", async () => {
    // Resolve feat-a to its change id via the diff endpoint.
    const before = DiffResponseSchema.parse(
      await (await fetch(url("/api/diff?change=feat-a"))).json(),
    );
    const changeId = before.change!.changeId;
    expect(before.change!.immutable).toBe(false);

    const res = await post({
      action: "describe",
      changeId,
      message: "feat-a: add alpha (edited)",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const stack = StackViewSchema.parse(
      await (await fetch(url("/api/stack"))).json(),
    );
    const featA = stack.segments.find((s) => s.name === "feat-a")!;
    expect(featA.changes[0]!.description).toStartWith(
      "feat-a: add alpha (edited)",
    );

    // Restore the original description so other tests' fixtures hold.
    const restore = await post({
      action: "describe",
      changeId,
      message: "feat-a: add alpha",
    });
    expect(restore.status).toBe(200);
  });

  test("rejects describing an immutable change", async () => {
    const res = await post({
      action: "describe",
      changeId: "main",
      message: "rewrite trunk",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("immutable");
  });

  test("rejects an unresolvable change", async () => {
    const res = await post({
      action: "describe",
      changeId: "none()",
      message: "ghost",
    });
    expect(res.status).toBe(400);
  });

  test("rejects an empty message", async () => {
    const res = await post({ action: "describe", changeId: "@", message: "" });
    expect(res.status).toBe(400);
  });

  test("rejects an unknown action", async () => {
    const res = await post({ action: "explode", changeId: "@" });
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

describe("RepoWatcher polling", () => {
  function stubJj(behavior?: () => Promise<string>) {
    let calls = 0;
    const jj = {
      opHeadId: () => {
        calls++;
        return behavior ? behavior() : Promise.resolve("op-constant");
      },
    } as unknown as import("../lib/jj").Jj;
    return { jj, calls: () => calls };
  }

  test("does not spawn polls while no client is connected", async () => {
    const { jj, calls } = stubJj();
    const w = new RepoWatcher(jj, 10);
    w.start();
    await w.ready;
    await Bun.sleep(60);
    w.stop();
    expect(calls()).toBe(1); // baseline only
  });

  test("polls while a client is connected", async () => {
    const { jj, calls } = stubJj();
    const w = new RepoWatcher(jj, 10);
    w.start();
    await w.ready;
    w.sseResponse(); // constructing the stream registers the client
    await Bun.sleep(60);
    w.stop();
    expect(calls()).toBeGreaterThan(2);
  });

  test("overlapping polls are skipped, not stacked", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { jj, calls } = stubJj(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Bun.sleep(35); // 3+ interval ticks land while one poll runs
      inFlight--;
      return "op-constant";
    });
    const w = new RepoWatcher(jj, 10);
    w.start();
    await w.ready;
    w.sseResponse();
    await Bun.sleep(80);
    w.stop();
    expect(maxInFlight).toBe(1);
    expect(calls()).toBeGreaterThan(1);
  });
});
