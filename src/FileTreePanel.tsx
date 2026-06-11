import { useMemo } from "react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { prepareFileTreeInput } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";

type GitStatus = "added" | "deleted" | "modified" | "renamed";

function statusFor(file: FileDiffMetadata): GitStatus {
  switch (file.type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

export function FileTreePanel({
  files,
  onSelectFile,
}: {
  files: FileDiffMetadata[];
  onSelectFile: (name: string) => void;
}) {
  // The tree model is created once per file-set; key the inner component on
  // the path list so a new diff rebuilds it from scratch.
  const treeKey = useMemo(() => files.map((f) => f.name).join("\n"), [files]);
  return (
    <TreeInner key={treeKey} files={files} onSelectFile={onSelectFile} />
  );
}

function TreeInner({
  files,
  onSelectFile,
}: {
  files: FileDiffMetadata[];
  onSelectFile: (name: string) => void;
}) {
  const stats = useMemo(() => {
    const map = new Map<string, { added: number; removed: number; status: GitStatus }>();
    for (const file of files) {
      let added = 0;
      let removed = 0;
      for (const hunk of file.hunks) {
        added += hunk.additionLines;
        removed += hunk.deletionLines;
      }
      map.set(file.name, { added, removed, status: statusFor(file) });
    }
    return map;
  }, [files]);

  const preparedInput = useMemo(
    () => prepareFileTreeInput(files.map((f) => f.name)),
    [files],
  );

  const { model } = useFileTree({
    preparedInput,
    initialExpansion: "open",
    flattenEmptyDirectories: true,
    icons: { set: "standard", colored: true },
    gitStatus: files.map((f) => ({ path: f.name, status: statusFor(f) })),
    onSelectionChange: (selected) => {
      const first = selected[0];
      if (first && stats.has(first)) onSelectFile(first);
    },
    renderRowDecoration: ({ item }) => {
      if (item.kind !== "file") return null;
      const stat = stats.get(item.path);
      if (!stat) return null;
      return {
        text: `+${stat.added} −${stat.removed}`,
        title: `${stat.added} additions, ${stat.removed} deletions`,
      };
    },
  });

  return (
    <div className="file-tree-panel">
      <FileTree model={model} className="file-tree" />
    </div>
  );
}
