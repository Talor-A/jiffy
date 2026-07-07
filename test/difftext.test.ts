import { describe, expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";
import { lineTextFor, snippetFor } from "../src/diffText";

const PATCH = `diff --git a/f.txt b/f.txt
index 0000000..1111111 100644
--- a/f.txt
+++ b/f.txt
@@ -1,4 +1,14 @@
 ctx one
-old two
+new two
+added three
+added four
+added five
+added six
+added seven
+added eight
+added nine
+added ten
+added eleven
+added twelve
 ctx three
 ctx four
`;

const file = parsePatchFiles(PATCH).flatMap((p) => p.files)[0]!;

describe("lineTextFor", () => {
  test("resolves an addition line", () => {
    expect(lineTextFor(file, "additions", 2)).toBe("new two");
  });

  test("resolves a deletion line", () => {
    expect(lineTextFor(file, "deletions", 2)).toBe("old two");
  });

  test("returns null for lines outside every hunk", () => {
    expect(lineTextFor(file, "additions", 999)).toBeNull();
  });

  test("strips line terminators", () => {
    for (const side of ["additions", "deletions"] as const) {
      for (let line = 1; line <= 14; line++) {
        const text = lineTextFor(file, side, line);
        if (text !== null) expect(text.endsWith("\n")).toBe(false);
      }
    }
  });
});

describe("snippetFor", () => {
  test("joins a multi-line range", () => {
    expect(snippetFor(file, "additions", 2, 4)).toBe(
      "new two\nadded three\nadded four",
    );
  });

  test("caps at eight lines and appends ellipsis", () => {
    const snippet = snippetFor(file, "additions", 2, 13);
    const lines = snippet!.split("\n");
    expect(lines).toHaveLength(9);
    expect(lines[0]).toBe("new two");
    expect(lines[7]).toBe("added nine");
    expect(lines[8]).toBe("…");
  });

  test("degenerate range equals single line lookup", () => {
    expect(snippetFor(file, "additions", 2, 2)).toBe(
      lineTextFor(file, "additions", 2),
    );
  });

  test("renders ellipsis for missing middle lines", () => {
    expect(snippetFor(file, "additions", 14, 16)).toBe("ctx four\n…\n…");
  });
});
