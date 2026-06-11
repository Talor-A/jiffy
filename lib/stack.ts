import type {
  BookmarkRow,
  ChangeInfo,
  GhPullRequest,
  PushStatus,
  StackSegment,
  StackView,
} from "./schema";

/**
 * Pure stack assembly: turn `jj log -r 'trunk()..@'` output plus bookmark and
 * PR listings into the segment view the UI renders. No subprocess calls in
 * here so the logic is unit-testable on synthetic data.
 */

/**
 * Group changes (ordered newest-first, i.e. `@` down to just above trunk)
 * into segments. A change carrying a local bookmark is the head of a new
 * segment that owns it and every following (older) change until the next
 * bookmarked change. Changes above the topmost bookmark form the anonymous
 * working segment (`name: null`).
 */
export function segmentChanges(changes: ChangeInfo[]): StackSegment[] {
  const segments: StackSegment[] = [];
  let acc: ChangeInfo[] = [];
  let name: string | null = null;
  let bookmarks: string[] = [];

  const flush = () => {
    const head = acc[0];
    if (!head) return;
    const oldest = acc[acc.length - 1]!;
    segments.push({
      name,
      bookmarks,
      changes: acc,
      headChangeId: head.changeId,
      baseChangeId: oldest.parents[0] ?? null,
      pushStatus: null,
      pr: null,
    });
  };

  for (const change of changes) {
    if (change.localBookmarks.length > 0) {
      flush();
      acc = [];
      name = change.localBookmarks[0]!;
      bookmarks = change.localBookmarks;
    }
    acc.push(change);
  }
  flush();
  return segments;
}

/**
 * Push status for a local bookmark, derived from `jj bookmark list -a` rows.
 * Rows with remote "git" mirror the colocated git backend, not a real remote.
 */
export function pushStatusFor(
  bookmarkName: string,
  rows: BookmarkRow[],
): PushStatus {
  const local = rows.find((r) => r.name === bookmarkName && !r.remote);
  const remotes = rows.filter(
    (r) => r.name === bookmarkName && r.remote && r.remote !== "git",
  );
  if (remotes.length === 0) return "unpushed";
  if (!local) return "synced"; // remote-only bookmark; nothing local to push
  const localTarget = local.target.join(",");
  return remotes.every((r) => r.target.join(",") === localTarget)
    ? "synced"
    : "outdated";
}

export interface AssembleStackInput {
  /** `trunk()..@`, newest-first. */
  changes: ChangeInfo[];
  trunkName: string;
  trunkChange: ChangeInfo | null;
  bookmarkRows: BookmarkRow[];
  pullRequests: GhPullRequest[];
}

export function assembleStack(input: AssembleStackInput): StackView {
  const prByHead = new Map(
    input.pullRequests.map((pr) => [pr.headRefName, pr]),
  );

  const segments = segmentChanges(input.changes).map((segment) => {
    if (segment.name === null) return segment;
    // Prefer the bookmark that has an open PR as the segment's identity.
    const prBookmark = segment.bookmarks.find((b) => prByHead.has(b));
    const name = prBookmark ?? segment.name;
    return {
      ...segment,
      name,
      pushStatus: pushStatusFor(name, input.bookmarkRows),
      pr: prByHead.get(name) ?? null,
    };
  });

  const workingCopy =
    input.changes.find((c) => c.isWorkingCopy) ??
    (input.trunkChange?.isWorkingCopy ? input.trunkChange : null);

  const hasUnpushedWork = segments.some(
    (s) =>
      (s.name !== null && s.pushStatus !== "synced") ||
      // Anonymous segment counts when it has real content.
      (s.name === null && s.changes.some((c) => !c.empty)),
  );

  return {
    segments,
    trunkName: input.trunkName,
    trunkChange: input.trunkChange,
    workingCopy,
    hasUnpushedWork,
  };
}

/** First line of a change description, or a placeholder. */
export function summaryLine(change: ChangeInfo): string {
  const first = change.description.split("\n", 1)[0]?.trim();
  return first || "(no description)";
}
