import type { Server } from "bun";
import { z } from "zod";
import { CommandError } from "./exec";
import type { Jj } from "./jj";
import { CommentStore, exportMarkdown } from "./comments";
import { fetchGithubContext } from "./github";
import { assembleStack } from "./stack";
import {
  ActionRequestSchema,
  CommentInputSchema,
  CommentPatchSchema,
  DiffRequestSchema,
  type ActionRequest,
  type ChangeInfo,
  type DiffEndpoint,
  type DiffResponse,
  type GithubContext,
  ReviewFinishRequestSchema,
  type RepoInfo,
  type ReviewResult,
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

  /** Resolves once the baseline op id is recorded (see {@link start}). */
  ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly jj: Jj,
    private readonly intervalMs = 2_000,
  ) {}

  start(): void {
    if (this.timer) return;
    // Prime the baseline immediately: the first observation of the op id
    // only records it, so a repo change landing before the first interval
    // tick would otherwise be missed silently.
    this.ready = this.poll();
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
    } else {
      // SSE comment ping so Bun's idleTimeout (10s) never reaps a quiet
      // stream; a reaped stream can miss a broadcast while reconnecting.
      this.send(new TextEncoder().encode(`: ka\n\n`));
    }
    this.lastOpId = opId;
  }

  broadcast(type: string): void {
    this.send(
      new TextEncoder().encode(`data: ${JSON.stringify({ type })}\n\n`),
    );
  }

  private send(payload: Uint8Array): void {
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
  opts: { port: number; hostname?: string; reviewMode?: boolean },
): { server: Server<unknown>; watcher: RepoWatcher; review: Promise<ReviewResult> | null } {
  const { jj, store } = deps;
  const github = deps.github ?? fetchGithubContext;
  const watcher = new RepoWatcher(jj);

  const reviewMode = opts.reviewMode ?? false;
  let resolveReview: ((r: ReviewResult) => void) | null = null;
  const review: Promise<ReviewResult> | null = reviewMode
    ? new Promise<ReviewResult>((resolve) => {
        resolveReview = resolve;
      })
    : null;
  let reviewFinished = false;

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

  /**
   * Dispatch one validated jj action; returns an error string (→ 400) or
   * null on success. New actions slot in as additional cases.
   */
  const dispatchAction = async (
    input: ActionRequest,
  ): Promise<string | null> => {
    switch (input.action) {
      case "describe": {
        const change = await jj.resolve(input.changeId, { snapshot: true });
        if (!change) return `no revision matches: ${input.changeId}`;
        if (change.immutable) return "cannot describe an immutable change";
        await jj.describe(change.changeId, input.message);
        return null;
      }
      case "abandon": {
        const changes = await Promise.all(
          input.changeIds.map((changeId) => jj.resolve(changeId, { snapshot: true })),
        );
        const missing = input.changeIds[changes.findIndex((change) => !change)];
        if (missing) return `no revision matches: ${missing}`;
        const immutable = changes.find((change) => change?.immutable);
        if (immutable) return "cannot abandon an immutable change";
        await jj.abandon(changes.map((change) => change!.changeId));
        return null;
      }
      case "absorb": {
        const change = await jj.resolve(input.changeId, { snapshot: true });
        if (!change) return `no revision matches: ${input.changeId}`;
        if (change.immutable) return "cannot absorb from an immutable change";
        await jj.absorb(change.changeId, input.paths);
        return null;
      }
      case "squash": {
        if (!input.useDestinationMessage && !input.message) {
          return "squash requires a message or useDestinationMessage";
        }
        const source = await jj.resolve(input.fromChangeId, { snapshot: true });
        if (!source) return `no revision matches: ${input.fromChangeId}`;
        if (source.immutable) return "cannot squash an immutable change";
        if (source.parents.length !== 1 && !input.intoChangeId) {
          return "cannot squash a merge change without an explicit destination";
        }
        if (input.intoChangeId) {
          const destination = await jj.resolve(input.intoChangeId, {
            snapshot: true,
          });
          if (!destination) return `no revision matches: ${input.intoChangeId}`;
          if (destination.immutable) {
            return "cannot squash into an immutable change";
          }
        } else {
          const parent = await jj.resolve(source.parents[0]!, { snapshot: true });
          if (parent?.immutable) return "cannot squash into an immutable change";
        }
        await jj.squash({
          fromChangeId: source.changeId,
          intoChangeId: input.intoChangeId,
          message: input.message,
          useDestinationMessage: input.useDestinationMessage,
        });
        return null;
      }
      case "tug": {
        await jj.tug();
        return null;
      }
      case "bookmark-move": {
        const destination = await jj.resolve(input.toChangeId, {
          snapshot: true,
        });
        if (!destination) return `no revision matches: ${input.toChangeId}`;
        await jj.bookmarkMove(input.bookmarkName, destination.changeId);
        return null;
      }
      case "git-push": {
        await jj.gitPush();
        return null;
      }
      case "new": {
        await jj.newChange();
        return null;
      }
    }
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
            reviewMode,
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

          // Diff before resolving endpoints: the diff is what snapshots the
          // working copy for @-revsets, and clients key rendering on the
          // endpoint commit ids, so the ids must reflect the snapshotted
          // state the patch was produced from.
          if (spec.change !== undefined) {
            const patch = await jj.diffChange(spec.change);
            const change = await jj.resolve(spec.change);
            if (!change) {
              return json(
                { error: `no revision matches: ${spec.change}` },
                400,
              );
            }
            const body: DiffResponse = {
              patch,
              change: pickEndpoint(change),
              from: null,
              to: null,
            };
            return json(body);
          }

          const patch = await jj.diffRange(spec.from!, spec.to!);
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

      "/api/actions": {
        POST: api(async (req) => {
          const input = ActionRequestSchema.parse(await req.json());
          const error = await dispatchAction(input);
          if (error) return json({ error }, 400);
          watcher.broadcast("repo-changed");
          return json({ ok: true });
        }),
      },

      "/api/review": {
        POST: api(async (req) => {
          if (!reviewMode || !resolveReview) {
            return json({ error: "not running in --wait mode" }, 404);
          }
          if (reviewFinished) {
            return json({ error: "review already finished" }, 409);
          }
          const { verdict } = ReviewFinishRequestSchema.parse(await req.json());
          const comments = await store.list();
          const gh = await getGithub();
          const markdown =
            verdict === "request-changes"
              ? exportMarkdown(comments, { repoLabel: gh?.repo.nameWithOwner })
              : "";
          reviewFinished = true;
          resolveReview({ verdict, markdown, count: comments.length });
          return json({ ok: true });
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
  return { server, watcher, review };
}

function pickEndpoint(change: ChangeInfo): DiffEndpoint {
  return {
    changeId: change.changeId,
    changeIdPrefix: change.changeIdPrefix,
    commitId: change.commitId,
    commitIdPrefix: change.commitIdPrefix,
    description: change.description,
    immutable: change.immutable,
  };
}
