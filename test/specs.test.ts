import { describe, expect, test } from "bun:test";
import { changeSpec, segmentSpec, WC_SPEC } from "../src/api";

describe("segmentSpec", () => {
  test("anonymous segment IS the local-changes view", () => {
    const spec = segmentSpec({
      name: null,
      headChangeId: "abc",
      baseChangeId: "def",
    });
    expect(spec).toBe(WC_SPEC); // same object: same key, label, live params
    expect(spec.key).toBe("segment:@");
  });

  test("bookmarked segment keys on the bookmark and pins the range", () => {
    const spec = segmentSpec({
      name: "feat-a",
      headChangeId: "abc",
      baseChangeId: "def",
    });
    expect(spec.key).toBe("segment:feat-a");
    expect(spec.label).toBe("feat-a");
    expect(spec.params).toEqual({ from: "def", to: "abc" });
  });

  test("bookmarked segment with no base diffs the head change alone", () => {
    const spec = segmentSpec({
      name: "feat-a",
      headChangeId: "abc",
      baseChangeId: null,
    });
    expect(spec.params).toEqual({ change: "abc" });
  });
});

describe("changeSpec", () => {
  test("uses the first description line as the label", () => {
    const spec = changeSpec({
      changeId: "xyz",
      description: "add thing\n\nbody",
    });
    expect(spec.key).toBe("change:xyz");
    expect(spec.label).toBe("add thing");
  });

  test("falls back for empty descriptions", () => {
    expect(changeSpec({ changeId: "xyz", description: "" }).label).toBe(
      "(no description)",
    );
  });
});
