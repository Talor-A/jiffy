import type { FileDiffMetadata } from "@pierre/diffs";
import type { CommentSide } from "../lib/schema";

/**
 * Source text for a display line number (1-based, per side), resolved through
 * the hunk that contains it: hunk `*Start`/`*Count` give the display range and
 * `*LineIndex` points at the matching slot in the file's `additionLines` /
 * `deletionLines`. Null for lines outside every hunk (collapsed context).
 */
export function lineTextFor(
  file: FileDiffMetadata,
  side: CommentSide,
  line: number,
): string | null {
  const adds = side === "additions";
  for (const hunk of file.hunks) {
    const start = adds ? hunk.additionStart : hunk.deletionStart;
    const count = adds ? hunk.additionCount : hunk.deletionCount;
    if (line < start || line >= start + count) continue;
    const index = adds ? hunk.additionLineIndex : hunk.deletionLineIndex;
    const text = (adds ? file.additionLines : file.deletionLines)[
      index + (line - start)
    ];
    // Parsed lines keep their terminator; drop it so snippets join cleanly.
    return text?.replace(/\r?\n$/, "") ?? null;
  }
  return null;
}

/** Cap range snippets so exports stay readable for big drags. */
export const SNIPPET_MAX_LINES = 8;

/**
 * Code context for a comment spanning display lines lo..hi (inclusive):
 * newline-joined, capped at {@link SNIPPET_MAX_LINES} with a trailing "…"
 * line when truncated. Lines missing from the patch render as "…".
 */
export function snippetFor(
  file: FileDiffMetadata,
  side: CommentSide,
  lo: number,
  hi: number,
): string | null {
  if (hi <= lo) return lineTextFor(file, side, lo);
  const cap = Math.min(hi, lo + SNIPPET_MAX_LINES - 1);
  const lines: string[] = [];
  for (let n = lo; n <= cap; n++) {
    lines.push(lineTextFor(file, side, n) ?? "…");
  }
  if (cap < hi) lines.push("…");
  return lines.join("\n");
}
