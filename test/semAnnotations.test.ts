import { describe, expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";
import type { SemEntityChange } from "../lib/schema";
import {
  groupSemChangesByLine,
  lineVisibleInDiff,
  semAnnotationAnchor,
  semChangesForFile,
} from "../lib/semAnnotations";

function fileFromPatch(patch: string, name = "src/app.tsx") {
  const file = parsePatchFiles(patch).flatMap((p) => p.files)[0]!;
  expect(file.name).toBe(name);
  return file;
}

function entity(
  partial: Partial<SemEntityChange> & Pick<SemEntityChange, "changeType">,
): SemEntityChange {
  return {
    entityId: "id",
    entityType: "function",
    entityName: "foo",
    startLine: null,
    endLine: null,
    oldStartLine: null,
    oldEndLine: null,
    oldEntityName: null,
    filePath: "src/app.tsx",
    oldFilePath: null,
    ...partial,
  };
}

describe("semAnnotationAnchor", () => {
  test("added entities anchor on the additions side at endLine", () => {
    expect(
      semAnnotationAnchor(
        entity({ changeType: "added", startLine: 6, endLine: 48 }),
      ),
    ).toEqual({ side: "additions", line: 48 });
  });

  test("deleted entities anchor on the deletions side at oldEndLine", () => {
    expect(
      semAnnotationAnchor(
        entity({
          changeType: "deleted",
          oldStartLine: 518,
          oldEndLine: 665,
        }),
      ),
    ).toEqual({ side: "deletions", line: 665 });
  });

  test("modified entities anchor on the additions side", () => {
    expect(
      semAnnotationAnchor(
        entity({
          changeType: "modified",
          startLine: 30,
          endLine: 513,
          oldStartLine: 33,
          oldEndLine: 516,
        }),
      ),
    ).toEqual({ side: "additions", line: 513 });
  });
});

describe("lineVisibleInDiff", () => {
  const file = fileFromPatch(`diff --git a/src/app.tsx b/src/app.tsx
index 1111111..2222222 100644
--- a/src/app.tsx
+++ b/src/app.tsx
@@ -33,7 +33,10 @@
 context
-old line
+new line
 more context
`);

  test("line inside a hunk is visible", () => {
    expect(lineVisibleInDiff(file, "additions", 36)).toBe(true);
    expect(lineVisibleInDiff(file, "deletions", 36)).toBe(true);
  });

  test("line outside hunks is not visible", () => {
    expect(lineVisibleInDiff(file, "additions", 10)).toBe(false);
    expect(lineVisibleInDiff(file, "deletions", 100)).toBe(false);
  });
});

describe("groupSemChangesByLine", () => {
  test("groups entities sharing an anchor line", () => {
    const file = fileFromPatch(`diff --git a/src/app.tsx b/src/app.tsx
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/app.tsx
@@ -0,0 +1,70 @@
+line
`);
    const changes = [
      entity({
        entityId: "a",
        changeType: "added",
        entityName: "StackPanel",
        startLine: 1,
        endLine: 1,
      }),
      entity({
        entityId: "b",
        changeType: "added",
        entityType: "variable",
        entityName: "PUSH_STATUS_LABEL",
        startLine: 1,
        endLine: 1,
      }),
    ];
    const groups = groupSemChangesByLine(file, changes);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entities).toHaveLength(2);
  });

  test("skips entities on collapsed context lines", () => {
    const file = fileFromPatch(`diff --git a/src/app.tsx b/src/app.tsx
index 1111111..2222222 100644
--- a/src/app.tsx
+++ b/src/app.tsx
@@ -100,3 +100,4 @@
 context
+added
`);
    const groups = groupSemChangesByLine(file, [
      entity({
        changeType: "added",
        startLine: 6,
        endLine: 48,
      }),
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("semChangesForFile", () => {
  test("matches current and old file paths", () => {
    const changes = [
      entity({ filePath: "src/new.ts", changeType: "added" }),
      entity({
        filePath: "src/old.ts",
        oldFilePath: "src/renamed.ts",
        changeType: "renamed",
      }),
    ];
    expect(semChangesForFile(changes, "src/new.ts")).toHaveLength(1);
    expect(semChangesForFile(changes, "src/renamed.ts")).toHaveLength(1);
    expect(semChangesForFile(changes, "src/other.ts")).toHaveLength(0);
  });
});
