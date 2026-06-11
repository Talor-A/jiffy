import { describe, expect, test } from "bun:test";
import {
  assembleStack,
  pushStatusFor,
  segmentChanges,
  summaryLine,
} from "../lib/stack";
import type { BookmarkRow, ChangeInfo, GhPullRequest } from "../lib/schema";

let counter = 0;
function change(overrides: Partial<ChangeInfo> = {}): ChangeInfo {
  counter++;
  return {
    changeId: `change${counter}`,
    changeIdPrefix: `change${counter}`.slice(0, 3),
    commitId: `commit${counter}`,
    commitIdPrefix: `commit${counter}`.slice(0, 3),
    description: `change ${counter}\n`,
    empty: false,
    fileCount: 1,
    immutable: false,
    isWorkingCopy: false,
    parents: [`change${counter + 1}`], // linear: parent is the next (older) one
    localBookmarks: [],
    remoteBookmarks: [],
    authorName: "Test",
    timestamp: "2026-06-11T00:00:00-07:00",
    ...overrides,
  };
}

function pr(overrides: Partial<GhPullRequest> = {}): GhPullRequest {
  return {
    number: 1,
    title: "a pr",
    url: "https://github.com/o/r/pull/1",
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "feature",
    ...overrides,
  };
}

describe("segmentChanges", () => {
  test("empty stack produces no segments", () => {
    expect(segmentChanges([])).toEqual([]);
  });

  test("unbookmarked changes form one anonymous segment", () => {
    const wc = change({ isWorkingCopy: true, empty: true });
    const c2 = change();
    const segments = segmentChanges([wc, c2]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.name).toBeNull();
    expect(segments[0]!.changes.map((c) => c.changeId)).toEqual([
      wc.changeId,
      c2.changeId,
    ]);
    expect(segments[0]!.headChangeId).toBe(wc.changeId);
    expect(segments[0]!.baseChangeId).toBe(c2.parents[0]!);
  });

  test("bookmarked change starts a segment owning older changes", () => {
    const wc = change({ isWorkingCopy: true, empty: true });
    const head = change({ localBookmarks: ["feat-b"] });
    const mid = change();
    const bottom = change({ localBookmarks: ["feat-a"] });
    const segments = segmentChanges([wc, head, mid, bottom]);

    expect(segments.map((s) => s.name)).toEqual([null, "feat-b", "feat-a"]);
    expect(segments[1]!.changes.map((c) => c.changeId)).toEqual([
      head.changeId,
      mid.changeId,
    ]);
    expect(segments[1]!.baseChangeId).toBe(mid.parents[0]!);
    expect(segments[2]!.changes).toHaveLength(1);
  });

  test("bookmark on @ itself produces no anonymous segment", () => {
    const wc = change({ isWorkingCopy: true, localBookmarks: ["mine"] });
    const segments = segmentChanges([wc]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.name).toBe("mine");
  });
});

describe("pushStatusFor", () => {
  const rows: BookmarkRow[] = [
    { name: "synced", target: ["aaa"] },
    { name: "synced", remote: "origin", target: ["aaa"] },
    { name: "synced", remote: "git", target: ["zzz"] }, // colocated mirror: ignored
    { name: "moved", target: ["bbb"] },
    { name: "moved", remote: "origin", target: ["abc"] },
    { name: "local-only", target: ["ccc"] },
    { name: "local-only", remote: "git", target: ["ccc"] },
  ];

  test("matching origin target is synced", () => {
    expect(pushStatusFor("synced", rows)).toBe("synced");
  });
  test("differing origin target is outdated", () => {
    expect(pushStatusFor("moved", rows)).toBe("outdated");
  });
  test("no real remote row is unpushed", () => {
    expect(pushStatusFor("local-only", rows)).toBe("unpushed");
  });
});

describe("assembleStack", () => {
  test("attaches PRs by head bookmark and computes unpushed work", () => {
    const wc = change({ isWorkingCopy: true, empty: true });
    const feat = change({ localBookmarks: ["feature"] });
    const stack = assembleStack({
      changes: [wc, feat],
      trunkName: "main",
      trunkChange: change({ immutable: true, localBookmarks: ["main"] }),
      bookmarkRows: [
        { name: "feature", target: [feat.commitId] },
        { name: "feature", remote: "origin", target: [feat.commitId] },
      ],
      pullRequests: [pr({ headRefName: "feature", number: 42 })],
    });

    expect(stack.segments).toHaveLength(2);
    const featSegment = stack.segments[1]!;
    expect(featSegment.pr?.number).toBe(42);
    expect(featSegment.pushStatus).toBe("synced");
    expect(stack.workingCopy?.changeId).toBe(wc.changeId);
    // Anonymous segment only has an empty wc change -> nothing to push.
    expect(stack.hasUnpushedWork).toBe(false);
  });

  test("prefers the bookmark that has an open PR as segment identity", () => {
    const head = change({ localBookmarks: ["scratch", "with-pr"] });
    const stack = assembleStack({
      changes: [head],
      trunkName: "main",
      trunkChange: null,
      bookmarkRows: [
        { name: "scratch", target: [head.commitId] },
        { name: "with-pr", target: [head.commitId] },
        { name: "with-pr", remote: "origin", target: [head.commitId] },
      ],
      pullRequests: [pr({ headRefName: "with-pr", number: 7 })],
    });
    expect(stack.segments[0]!.name).toBe("with-pr");
    expect(stack.segments[0]!.pr?.number).toBe(7);
  });

  test("non-empty anonymous work or unsynced bookmark flags unpushed", () => {
    const wc = change({ isWorkingCopy: true, empty: false });
    const stack = assembleStack({
      changes: [wc],
      trunkName: "main",
      trunkChange: null,
      bookmarkRows: [],
      pullRequests: [],
    });
    expect(stack.hasUnpushedWork).toBe(true);
  });
});

describe("summaryLine", () => {
  test("first line, or placeholder when undescribed", () => {
    expect(summaryLine(change({ description: "fix: thing\n\nbody\n" }))).toBe(
      "fix: thing",
    );
    expect(summaryLine(change({ description: "" }))).toBe("(no description)");
  });
});
