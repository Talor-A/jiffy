import type { Server } from "bun";
import { z } from "zod";
import { CommandError } from "./exec";
import type { Jj } from "./jj";
import { CommentStore, exportMarkdown } from "./comments";
import { fetchGithubContext } from "./github";
import { assembleStack } from "./stack";
import {
  CommentInputSchema,
  CommentPatchSchema,
  DiffRequestSchema,
  type DiffResponse,
  type GithubContext,
  type RepoInfo,
  type StackView,
} from "./schema";

export interface ServerDeps {
  jj: Jj;
  store: CommentStore;
  /** Injectable for tests; defaults to the real `gh`-backed fetcher. */
  github?: (cwd: string) => Promise<GithubContext | null>;
  /** Bun HTML import for the frontend; omitted in tests. */
  frontend?: unknown;
}

const GITHUB_CACHE_MS = 60_000;

/** Broadcasts repo-change events to SSE clients by polling the jj op log. */
export class RepoWatcher {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private lastOpId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jj: Jj,
    private readonly intervalMs = 2_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const client of this.clients) {
      try {
        client.close();
      } catch {}
    }
    this.clients.clear();
  }

  private async poll(): Promise<void> {
    let opId: string;
    try {
      opId = await this.jj.opHeadId();
    } catch {
      return; // transient lock contention etc.; try again next tick
    }
    if (this.lastOpId !== null && opId !== this.lastOpId) {
      this.broadcast("repo-changed");
    }
    this.lastOpId = opId;
  }

  broadcast(type: string): void {
    const payload = new TextEncoder().encode(
      `data: ${JSON.stringify({ type })}\n\n`,
    );
    for (const client of this.clients) {
      try {
        client.enqueue(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  sseResponse(): Response {
    const clients = this.clients;
    let controllerRef: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
        clients.add(controller);
        controller.enqueue(new TextEncoder().encode(`: connected\n\n`));
      },
      cancel() {
        clients.delete(controllerRef);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Wrap a handler: zod errors → 400, jj errors → 400, the rest → 500. */
function api(
  handler: (req: Bun.BunRequest) => Promise<Response> | Response,
): (req: Bun.BunRequest) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return json({ error: z.prettifyError(e) }, 400);
      }
      if (e instanceof CommandError) {
        return json({ error: e.stderr.trim() || e.message }, 400);
      }
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  };
}

export function createServer(
  deps: ServerDeps,
  opts: { port: number; hostname?: string },
): { server: Server<unknown>; watcher: RepoWatcher } {
  const { jj, store } = deps;
  const github = deps.github ?? fetchGithubContext;
  const watcher = new RepoWatcher(jj);

  let githubCache: { value: GithubContext | null; at: number } | null = null;
  const getGithub = async (force = false): Promise<GithubContext | null> => {
    if (!force && githubCache && Date.now() - githubCache.at < GITHUB_CACHE_MS) {
      return githubCache.value;
    }
    const value = await github(jj.cwd);
    githubCache = { value, at: Date.now() };
    return value;
  };

  const getStack = async (snapshot: boolean): Promise<StackView> => {
    if (snapshot) await jj.snapshot();
    const [changes, trunkName, trunkChange, bookmarkRows, gh] =
      await Promise.all([
        jj.log("trunk()..@"),
        jj.trunkName(),
        jj.resolve("trunk()"),
        jj.bookmarks(),
        getGithub(),
      ]);
    return assembleStack({
      changes,
      trunkName,
      trunkChange,
      bookmarkRows,
      pullRequests: gh?.pullRequests ?? [],
    });
  };

  const apiRoutes = {
      "/api/repo": {
        GET: api(async () => {
          const [trunkName, gh] = await Promise.all([
            jj.trunkName(),
            getGithub(),
          ]);
          const info: RepoInfo = {
            root: jj.cwd,
            trunkName,
            github: gh?.repo ?? null,
          };
          return json(info);
        }),
      },

      "/api/stack": {
        GET: api(async (req) => {
          const snapshot =
            new URL(req.url).searchParams.get("snapshot") === "1";
          return json(await getStack(snapshot));
        }),
      },

      "/api/diff": {
        GET: api(async (req) => {
          const params = new URL(req.url).searchParams;
          const spec = DiffRequestSchema.parse({
            change: params.get("change") ?? undefined,
            from: params.get("from") ?? undefined,
            to: params.get("to") ?? undefined,
          });

          if (spec.change !== undefined) {
            const change = await jj.resolve(spec.change);
            if (!change) {
              return json(
                { error: `no revision matches: ${spec.change}` },
                400,
              );
            }
            const patch = await jj.diffChange(spec.change);
            const body: DiffResponse = {
              patch,
              change: pickEndpoint(change),
              from: null,
              to: null,
            };
            return json(body);
          }

          const [from, to] = await Promise.all([
            jj.resolve(spec.from!),
            jj.resolve(spec.to!),
          ]);
          if (!from || !to) {
            return json(
              {
                error: `no revision matches: ${!from ? spec.from : spec.to}`,
              },
              400,
            );
          }
          const patch = await jj.diffRange(spec.from!, spec.to!);
          const body: DiffResponse = {
            patch,
            from: pickEndpoint(from),
            to: pickEndpoint(to),
            change: null,
          };
          return json(body);
        }),
      },

      "/api/comments": {
        GET: api(async (req) => {
          const specKey =
            new URL(req.url).searchParams.get("specKey") ?? undefined;
          return json({ comments: await store.list(specKey) });
        }),
        POST: api(async (req) => {
          const input = CommentInputSchema.parse(await req.json());
          return json(await store.add(input), 201);
        }),
        DELETE: api(async (req) => {
          const specKey =
            new URL(req.url).searchParams.get("specKey") ?? undefined;
          const removed = await store.clear(specKey);
          return json({ ok: true, removed });
        }),
      },

      "/api/comments/:id": {
        PATCH: api(async (req) => {
          const { text } = CommentPatchSchema.parse(await req.json());
          const updated = await store.updateText(
            (req.params as { id: string }).id,
            text,
          );
          return updated
            ? json(updated)
            : json({ error: "comment not found" }, 404);
        }),
        DELETE: api(async (req) => {
          const removed = await store.remove(
            (req.params as { id: string }).id,
          );
          return removed
            ? json({ ok: true })
            : json({ error: "comment not found" }, 404);
        }),
      },

      "/api/export": {
        GET: api(async (req) => {
          const params = new URL(req.url).searchParams;
          const specKey = params.get("specKey") ?? undefined;
          const comments = await store.list(specKey);
          const gh = await getGithub();
          const markdown = exportMarkdown(comments, {
            repoLabel: gh?.repo.nameWithOwner,
          });
          return json({ markdown, count: comments.length });
        }),
      },

      "/api/refresh": {
        POST: api(async () => {
          await jj.snapshot();
          githubCache = null;
          await getGithub(true);
          watcher.broadcast("repo-changed");
          return json({ ok: true });
        }),
      },

      "/api/events": {
        GET: () => watcher.sseResponse(),
      },

      "/favicon.ico": () => new Response(null, { status: 204 }),
  };

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname ?? "localhost",
    development: process.env.NODE_ENV !== "production" && { hmr: false },
    routes: {
      ...apiRoutes,
      "/": (deps.frontend ??
        (() => json({ error: "frontend not bundled" }, 404))) as never,
    },
    fetch() {
      return json({ error: "not found" }, 404);
    },
  });

  watcher.start();
  return { server, watcher };
}

function pickEndpoint(change: {
  changeId: string;
  changeIdPrefix: string;
  commitId: string;
  commitIdPrefix: string;
  description: string;
}): {
  changeId: string;
  changeIdPrefix: string;
  commitId: string;
  commitIdPrefix: string;
  description: string;
} {
  return {
    changeId: change.changeId,
    changeIdPrefix: change.changeIdPrefix,
    commitId: change.commitId,
    commitIdPrefix: change.commitIdPrefix,
    description: change.description,
  };
}
