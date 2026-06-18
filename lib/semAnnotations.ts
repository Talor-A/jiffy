import type { FileDiffMetadata } from "@pierre/diffs";
import type { CommentSide, SemEntityChange } from "./schema";

export interface SemLineGroup {
  side: CommentSide;
  line: number;
  entities: SemEntityChange[];
}

/** Entities that belong to a file in the Pierre diff view. */
export function semChangesForFile(
  changes: SemEntityChange[],
  filePath: string,
): SemEntityChange[] {
  return (
    changes
      .filter((c) => c.filePath === filePath || c.oldFilePath === filePath)
      // .filter((c) => !c.structuralChange)
      .filter(
        (c) => !(c.entityType === "orphan" && c.entityName === "module-level"),
      )
  );
}

/** Whether a file line number is visible in the rendered diff hunks. */
export function lineVisibleInDiff(
  file: FileDiffMetadata,
  side: CommentSide,
  line: number,
): boolean {
  const adds = side === "additions";
  for (const hunk of file.hunks) {
    const start = adds ? hunk.additionStart : hunk.deletionStart;
    const count = adds ? hunk.additionCount : hunk.deletionCount;
    if (line >= start && line < start + count) return true;
  }
  return false;
}

/** Pick the diff side and anchor line for a sem entity annotation. */
export function semAnnotationAnchor(change: SemEntityChange): {
  side: CommentSide;
  line: number;
} | null {
  switch (change.changeType) {
    case "deleted":
      if (change.oldEndLine != null) {
        return { side: "deletions", line: change.oldEndLine };
      }
      if (change.oldStartLine != null) {
        return { side: "deletions", line: change.oldStartLine };
      }
      return null;
    case "added":
    case "modified":
      if (change.endLine != null) {
        return { side: "additions", line: change.endLine };
      }
      if (change.startLine != null) {
        return { side: "additions", line: change.startLine };
      }
      return null;
    default:
      if (change.endLine != null) {
        return { side: "additions", line: change.endLine };
      }
      if (change.oldEndLine != null) {
        return { side: "deletions", line: change.oldEndLine };
      }
      return null;
  }
}

/** Group sem entities by the line they annotate, skipping collapsed context. */
export function groupSemChangesByLine(
  file: FileDiffMetadata,
  changes: SemEntityChange[],
): SemLineGroup[] {
  const groups = new Map<string, SemLineGroup>();
  for (const change of changes) {
    const anchor = semAnnotationAnchor(change);
    if (!anchor) continue;
    if (!lineVisibleInDiff(file, anchor.side, anchor.line)) continue;
    const key = `${anchor.side}:${anchor.line}`;
    const existing = groups.get(key);
    if (existing) {
      existing.entities.push(change);
    } else {
      groups.set(key, {
        side: anchor.side,
        line: anchor.line,
        entities: [change],
      });
    }
  }
  return [...groups.values()];
}
