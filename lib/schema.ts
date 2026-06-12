import { z } from "zod";

/**
 * Shared schemas for everything that crosses a process or network boundary:
 * jj CLI output -> server, gh CLI output -> server, and server API -> client.
 * The client imports these too, so request/response types stay in lockstep.
 */

// ---------------------------------------------------------------------------
// jj CLI output
// ---------------------------------------------------------------------------

/** One line of `jj log` rendered with {@link CHANGE_TEMPLATE} (lib/jj.ts). */
export const ChangeInfoSchema = z.object({
  changeId: z.string().min(1),
  /** Shortest unique prefix of the change id (jj-log-style highlighting). */
  changeIdPrefix: z.string().min(1),
  commitId: z.string().min(1),
  /** Shortest unique prefix of the commit id. */
  commitIdPrefix: z.string().min(1),
  /** Full description; first line is the summary. Empty string if undescribed. */
  description: z.string(),
  empty: z.boolean(),
  fileCount: z.number().int().nonnegative(),
  immutable: z.boolean(),
  isWorkingCopy: z.boolean(),
  /** Change ids of parents, first-parent first. */
  parents: z.array(z.string()),
  localBookmarks: z.array(z.string()),
  remoteBookmarks: z.array(z.object({ name: z.string(), remote: z.string() })),
  authorName: z.string(),
  /** ISO-8601 committer timestamp. */
  timestamp: z.string(),
});
export type ChangeInfo = z.infer<typeof ChangeInfoSchema>;

/**
 * One line of `jj bookmark list -a -T 'json(self) ++ "\n"'`.
 * Local rows omit `remote`; remote rows carry it ("git" rows are the
 * colocated-backend mirror and should be ignored for push status).
 */
export const BookmarkRowSchema = z.object({
  name: z.string(),
  remote: z.string().optional(),
  /** Commit ids the ref points at (>1 means conflicted ref). */
  target: z.array(z.string().nullable()),
  tracking_target: z.array(z.string().nullable()).optional(),
});
export type BookmarkRow = z.infer<typeof BookmarkRowSchema>;

// ---------------------------------------------------------------------------
// gh CLI output
// ---------------------------------------------------------------------------

export const GhPullRequestSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  isDraft: z.boolean(),
  baseRefName: z.string(),
  headRefName: z.string(),
});
export type GhPullRequest = z.infer<typeof GhPullRequestSchema>;

export const GhRepoSchema = z.object({
  nameWithOwner: z.string(),
  url: z.string(),
});

export const GithubContextSchema = z.object({
  repo: GhRepoSchema,
  pullRequests: z.array(GhPullRequestSchema),
});
export type GithubContext = z.infer<typeof GithubContextSchema>;

// ---------------------------------------------------------------------------
// Domain model: the stack
// ---------------------------------------------------------------------------

export const PushStatusSchema = z.enum([
  /** Local bookmark matches its origin counterpart. */
  "synced",
  /** Bookmark exists on origin but points elsewhere — needs a push. */
  "outdated",
  /** No origin counterpart yet. */
  "unpushed",
]);
export type PushStatus = z.infer<typeof PushStatusSchema>;

/**
 * A contiguous run of changes in `trunk()..@` owned by one bookmark (the
 * bookmark sits on the segment head), or the anonymous run above the topmost
 * bookmark (`name: null`) — i.e. work not yet attached to any PR.
 */
export const StackSegmentSchema = z.object({
  /** Primary bookmark name, or null for the anonymous top-of-stack segment. */
  name: z.string().nullable(),
  /** All local bookmarks on the head change (usually 0 or 1). */
  bookmarks: z.array(z.string()),
  /** Changes newest-first; head is `changes[0]`. */
  changes: z.array(ChangeInfoSchema),
  headChangeId: z.string(),
  /** First parent of the oldest change: the diff base for this segment. */
  baseChangeId: z.string().nullable(),
  pushStatus: PushStatusSchema.nullable(),
  pr: GhPullRequestSchema.nullable(),
});
export type StackSegment = z.infer<typeof StackSegmentSchema>;

export const StackViewSchema = z.object({
  /** Segments newest-first: working copy at index 0, trunk-adjacent last. */
  segments: z.array(StackSegmentSchema),
  trunkName: z.string(),
  trunkChange: ChangeInfoSchema.nullable(),
  workingCopy: ChangeInfoSchema.nullable(),
  /** True when anything in the stack is waiting to be pushed. */
  hasUnpushedWork: z.boolean(),
});
export type StackView = z.infer<typeof StackViewSchema>;

// ---------------------------------------------------------------------------
// API: /api/repo
// ---------------------------------------------------------------------------

export const RepoInfoSchema = z.object({
  root: z.string(),
  trunkName: z.string(),
  github: GhRepoSchema.nullable(),
});
export type RepoInfo = z.infer<typeof RepoInfoSchema>;

// ---------------------------------------------------------------------------
// API: /api/diff
// ---------------------------------------------------------------------------

/**
 * What to diff. Exactly one of:
 * - `change`: a single revision's diff (its parents -> itself), or
 * - `from` + `to`: an arbitrary range.
 * Values are revsets (change ids, bookmark names, or alias expressions like
 * `closest_bookmark(@)`); they are passed to jj as a single argv element.
 */
export const DiffRequestSchema = z
  .object({
    change: z.string().min(1).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
  })
  .refine((q) => (q.change ? !q.from && !q.to : !!q.from && !!q.to), {
    message: "provide either ?change= or both ?from= and ?to=",
  });
export type DiffRequest = z.infer<typeof DiffRequestSchema>;

/** A resolved endpoint of a diff, for display and stable labeling. */
export const DiffEndpointSchema = z.object({
  changeId: z.string(),
  changeIdPrefix: z.string(),
  commitId: z.string(),
  commitIdPrefix: z.string(),
  description: z.string(),
  immutable: z.boolean(),
});
export type DiffEndpoint = z.infer<typeof DiffEndpointSchema>;

export const DiffResponseSchema = z.object({
  /** Raw `jj diff --git` output; the client parses it with @pierre/diffs. */
  patch: z.string(),
  from: DiffEndpointSchema.nullable(),
  to: DiffEndpointSchema.nullable(),
  /** The single revision when the request used `change`. */
  change: DiffEndpointSchema.nullable(),
});
export type DiffResponse = z.infer<typeof DiffResponseSchema>;

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const CommentSideSchema = z.enum(["additions", "deletions"]);
export type CommentSide = z.infer<typeof CommentSideSchema>;

export const CommentSchema = z.object({
  id: z.string(),
  /**
   * Identifies the diff view the comment was left on (e.g. "wc",
   * "segment:ta/jj/foo", "change:closest_pushable(@)"). Spec-shaped rather
   * than commit-shaped so comments survive the agent amending commits.
   */
  specKey: z.string().min(1),
  /** Human-readable label of that view, used in exports. */
  specLabel: z.string(),
  file: z.string().min(1),
  side: CommentSideSchema,
  /** 1-based line number in the old (deletions) or new (additions) file. */
  line: z.number().int().positive(),
  /**
   * Inclusive last line of a range comment, on the same side as `line`.
   * Present only for ranges; invariant line < endLine (the client normalizes
   * drag direction before submitting).
   */
  endLine: z.number().int().positive().optional(),
  /** Source text of the commented line(s), captured for export context.
   * Multiline (newline-joined, possibly truncated) for range comments. */
  codeLine: z.string().nullable(),
  text: z.string().min(1),
  createdAt: z.string(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const CommentInputSchema = CommentSchema.omit({
  id: true,
  createdAt: true,
});
export type CommentInput = z.infer<typeof CommentInputSchema>;

export const CommentPatchSchema = z.object({ text: z.string().min(1) });

export const CommentListResponseSchema = z.object({
  comments: z.array(CommentSchema),
});

export const ExportResponseSchema = z.object({
  markdown: z.string(),
  count: z.number().int(),
});

// ---------------------------------------------------------------------------
// API: /api/actions
// ---------------------------------------------------------------------------

/**
 * A jj mutation requested by the client. Discriminated on `action`; the
 * union grows as more jj actions (squash, abandon, …) are added.
 */
export const ActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("describe"),
    changeId: z.string().min(1),
    message: z.string().min(1),
  }),
  z.object({
    action: z.literal("abandon"),
    changeIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal("absorb"),
    changeId: z.string().min(1),
    paths: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    action: z.literal("squash"),
    fromChangeId: z.string().min(1),
    intoChangeId: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    useDestinationMessage: z.boolean().optional(),
  }),
  z.object({ action: z.literal("tug") }),
  z.object({ action: z.literal("git-push") }),
]);
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

// ---------------------------------------------------------------------------
// API: misc
// ---------------------------------------------------------------------------

export const OkResponseSchema = z.object({ ok: z.literal(true) });

export const ApiErrorSchema = z.object({ error: z.string() });

/** Parse newline-delimited JSON records (one zod-validated object per line). */
export function parseJsonLines<T>(schema: z.ZodType<T>, text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, i) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (e) {
        throw new Error(
          `Invalid JSON on line ${i + 1}: ${(e as Error).message}\n${line}`,
        );
      }
      return schema.parse(value);
    });
}
