import type { z } from "zod";
import {
  ApiErrorSchema,
  CommentListResponseSchema,
  CommentSchema,
  DiffResponseSchema,
  ExportResponseSchema,
  OkResponseSchema,
  RepoInfoSchema,
  StackViewSchema,
  type ActionRequest,
  type Comment,
  type CommentInput,
  type DiffRequest,
  type DiffResponse,
  type RepoInfo,
  type StackView,
} from "../lib/schema";

/**
 * Typed client for the jiffy API. Every response is zod-parsed with the same
 * schemas the server uses, so a drifting payload fails fast instead of
 * rendering garbage.
 */

async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, init);
  const body: unknown = await res.json();
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error : `HTTP ${res.status} from ${path}`,
    );
  }
  return schema.parse(body);
}

export function getRepo(): Promise<RepoInfo> {
  return request(RepoInfoSchema, "/api/repo");
}

export function getStack(opts: { snapshot?: boolean } = {}): Promise<StackView> {
  return request(
    StackViewSchema,
    `/api/stack${opts.snapshot ? "?snapshot=1" : ""}`,
  );
}

export function getDiff(params: DiffRequest): Promise<DiffResponse> {
  const search = new URLSearchParams();
  if (params.change) search.set("change", params.change);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  return request(DiffResponseSchema, `/api/diff?${search}`);
}

export async function listComments(specKey?: string): Promise<Comment[]> {
  const search = specKey ? `?specKey=${encodeURIComponent(specKey)}` : "";
  const { comments } = await request(
    CommentListResponseSchema,
    `/api/comments${search}`,
  );
  return comments;
}

export function addComment(input: CommentInput): Promise<Comment> {
  return request(CommentSchema, "/api/comments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateComment(id: string, text: string): Promise<Comment> {
  return request(CommentSchema, `/api/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`failed to delete comment (${res.status})`);
}

export function exportFeedback(
  specKey?: string,
): Promise<{ markdown: string; count: number }> {
  const search = specKey ? `?specKey=${encodeURIComponent(specKey)}` : "";
  return request(ExportResponseSchema, `/api/export${search}`);
}

export async function clearComments(specKey?: string): Promise<void> {
  const search = specKey ? `?specKey=${encodeURIComponent(specKey)}` : "";
  const res = await fetch(`/api/comments${search}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`failed to clear comments (${res.status})`);
}

/** Run a jj action (e.g. describe) on the server. */
export function runAction(input: ActionRequest): Promise<{ ok: true }> {
  return request(OkResponseSchema, "/api/actions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function refreshRepo(): Promise<void> {
  const res = await fetch("/api/refresh", { method: "POST" });
  if (!res.ok) throw new Error(`refresh failed (${res.status})`);
}

/** Subscribe to repo-change events. Returns an unsubscribe function. */
export function onRepoChanged(handler: () => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as { type?: string };
      if (data.type === "repo-changed") handler();
    } catch {
      // ignore malformed events
    }
  };
  return () => source.close();
}

// ---------------------------------------------------------------------------
// Diff specs: what the user is currently reviewing.
// ---------------------------------------------------------------------------

export interface DiffSpec {
  /** Stable key; comments are grouped under it. */
  key: string;
  label: string;
  params: DiffRequest;
}

/**
 * The working-copy view: everything since the nearest bookmark, including
 * unsaved file edits (the @-revsets make the diff snapshot the working
 * copy). Shares its key with the unnamed stack segment, which is the same
 * view.
 */
export const WC_SPEC: DiffSpec = {
  key: "segment:@",
  label: "working copy",
  params: { from: "closest_bookmark(@)", to: "@" },
};

export const LATEST_SPEC: DiffSpec = {
  key: "latest",
  label: "Latest change",
  params: { change: "closest_pushable(@)" },
};

export function segmentSpec(segment: {
  name: string | null;
  headChangeId: string;
  baseChangeId: string | null;
}): DiffSpec {
  // The unbookmarked tip segment is the working-copy view; the revset form
  // (unlike pinned change ids) snapshots live file edits into the diff.
  if (segment.name === null) return WC_SPEC;
  return {
    key: `segment:${segment.name}`,
    label: segment.name,
    params: segment.baseChangeId
      ? { from: segment.baseChangeId, to: segment.headChangeId }
      : { change: segment.headChangeId },
  };
}

export function changeSpec(change: {
  changeId: string;
  description: string;
}): DiffSpec {
  const summary = change.description.split("\n", 1)[0]?.trim();
  return {
    key: `change:${change.changeId}`,
    label: summary || "(no description)",
    params: { change: change.changeId },
  };
}
