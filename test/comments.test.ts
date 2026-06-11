import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommentStore, exportMarkdown } from "../lib/comments";
import type { Comment, CommentInput } from "../lib/schema";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jiffy-comments-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function input(overrides: Partial<CommentInput> = {}): CommentInput {
  return {
    specKey: "wc",
    specLabel: "Working copy",
    file: "src/app.ts",
    side: "additions",
    line: 12,
    codeLine: "const x = 1;",
    text: "use a descriptive name",
    ...overrides,
  };
}

describe("CommentStore", () => {
  test("add, list, update, remove round-trip with persistence", async () => {
    const path = join(dir, "store1.json");
    const store = new CommentStore(path);

    const a = await store.add(input());
    const b = await store.add(input({ specKey: "segment:feat", line: 3 }));
    expect(a.id).not.toBe(b.id);

    expect(await store.list()).toHaveLength(2);
    expect(await store.list("wc")).toHaveLength(1);

    await store.updateText(a.id, "renamed advice");
    // Fresh store instance proves it persisted to disk.
    const reloaded = new CommentStore(path);
    const all = await reloaded.list();
    expect(all.find((c) => c.id === a.id)?.text).toBe("renamed advice");

    expect(await reloaded.remove(a.id)).toBe(true);
    expect(await reloaded.remove("nope")).toBe(false);
    expect(await reloaded.list()).toHaveLength(1);
  });

  test("clear by specKey and clear all", async () => {
    const store = new CommentStore(join(dir, "store2.json"));
    await store.add(input({ specKey: "a" }));
    await store.add(input({ specKey: "a" }));
    await store.add(input({ specKey: "b" }));
    expect(await store.clear("a")).toBe(2);
    expect(await store.list()).toHaveLength(1);
    expect(await store.clear()).toBe(1);
  });

  test("corrupt store fails loudly", async () => {
    const path = join(dir, "corrupt.json");
    await Bun.write(path, `{"version":1,"comments":[{"bogus":true}]}`);
    const store = new CommentStore(path);
    expect(store.list()).rejects.toThrow();
  });
});

describe("exportMarkdown", () => {
  const base: Omit<Comment, "specKey" | "specLabel" | "file" | "side" | "line" | "codeLine" | "text"> =
    { id: "x", createdAt: "2026-06-11T00:00:00Z" };

  test("groups by file, sorts by line, includes code context", () => {
    const md = exportMarkdown(
      [
        { ...base, ...input({ file: "b.ts", line: 9, text: "second file" }) },
        {
          ...base,
          ...input({
            file: "a.ts",
            line: 20,
            text: "multi\nline note",
            codeLine: "return value;",
          }),
        },
        {
          ...base,
          ...input({
            file: "a.ts",
            line: 4,
            side: "deletions",
            codeLine: null,
            text: "why was this removed?",
          }),
        },
      ],
      { repoLabel: "owner/repo" },
    );

    expect(md).toContain("# Review feedback — owner/repo");
    // a.ts section comes first and is sorted by line.
    expect(md.indexOf("## a.ts")).toBeLessThan(md.indexOf("## b.ts"));
    expect(md.indexOf("a.ts:4")).toBeLessThan(md.indexOf("a.ts:20"));
    expect(md).toContain("**a.ts:4 (removed line)**");
    expect(md).toContain("  return value;");
    expect(md).toContain("  > multi");
    expect(md).toContain("  > line note");
  });

  test("empty input produces a friendly message", () => {
    expect(exportMarkdown([])).toBe("No review comments.\n");
  });
});
