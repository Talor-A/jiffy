import { describe, expect, test } from "bun:test";
import type { ChangeInfo } from "../lib/schema";
import {
  bookmarkMoveDestinationConfig,
  changeLabel,
  squashIntoConfig,
  stackActionRequest,
} from "../src/stackPicker";

function change(overrides: Partial<ChangeInfo> = {}): ChangeInfo {
  return {
    changeId: "kmppsxsw",
    changeIdPrefix: "kmppsxsw",
    commitId: "abc123def456",
    commitIdPrefix: "abc123",
    description: "first line\nsecond line",
    empty: false,
    fileCount: 1,
    immutable: false,
    isWorkingCopy: false,
    parents: ["parent-change-id"],
    localBookmarks: [],
    remoteBookmarks: [],
    authorName: "Test Author",
    timestamp: "2026-07-07T00:00:00Z",
    ...overrides,
  };
}

describe("changeLabel", () => {
  test("uses the first line of a multi-line description", () => {
    expect(changeLabel(change())).toBe('kmppsxsw "first line"');
  });

  test("falls back when description is empty", () => {
    expect(changeLabel(change({ description: "" }))).toBe(
      'kmppsxsw "(no description)"',
    );
  });
});

describe("stackActionRequest", () => {
  const c = change();

  test("builds abandon requests", () => {
    expect(stackActionRequest("abandon", c)).toEqual({
      action: "abandon",
      changeIds: [c.changeId],
    });
  });

  test("builds absorb requests", () => {
    expect(stackActionRequest("absorb", c)).toEqual({
      action: "absorb",
      changeId: c.changeId,
    });
  });
});

describe("squashIntoConfig", () => {
  test("detail includes changeLabel output", () => {
    const c = change();
    expect(squashIntoConfig(c).detail).toContain(changeLabel(c));
  });
});

describe("bookmarkMoveDestinationConfig", () => {
  test("detail includes the bookmark name", () => {
    expect(bookmarkMoveDestinationConfig("feat-a").detail).toContain("feat-a");
  });
});
