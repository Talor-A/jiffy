import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import type { ChangeInfo, StackView } from "../lib/schema";
import { ChangeId } from "./ChangeId";
import { summaryLine } from "../lib/stack";

export interface PickableBookmark {
  name: string;
  segmentName: string | null;
  change: ChangeInfo;
}

export function flattenStackBookmarks(
  stack: StackView | null,
): PickableBookmark[] {
  if (!stack) return [];
  const seen = new Set<string>();
  const bookmarks: PickableBookmark[] = [];
  for (const segment of stack.segments) {
    const head = segment.changes[0];
    if (!head) continue;
    for (const name of head.localBookmarks) {
      if (seen.has(name)) continue;
      seen.add(name);
      bookmarks.push({
        name,
        segmentName: segment.name,
        change: head,
      });
    }
  }
  return bookmarks;
}

export function BookmarkPicker({
  open,
  title,
  detail,
  bookmarks,
  actionLabel,
  defaultBookmark,
  onPick,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  detail: string;
  bookmarks: PickableBookmark[];
  actionLabel: string;
  defaultBookmark?: string;
  onPick: (bookmark: PickableBookmark) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const searchableBookmarks = useMemo(
    () =>
      bookmarks.map((item) => ({
        ...item,
        summary: summaryLine(item.change),
      })),
    [bookmarks],
  );

  const defaultValue = useMemo(() => {
    const item = searchableBookmarks.find((i) => i.name === defaultBookmark);
    return item ? `${item.name} ${item.summary}` : undefined;
  }, [searchableBookmarks, defaultBookmark]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={title}
      loop
      defaultValue={defaultValue}
      vimBindings={false}
      overlayClassName="modal-overlay command-overlay"
      contentClassName="modal-panel command-panel commit-picker-panel"
    >
      <div className="commit-picker-header">
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <Command.Input
        autoFocus
        className="command-input"
        placeholder="Search bookmarks..."
        value={search}
        onValueChange={setSearch}
      />
      <Command.List className="command-list commit-picker-list">
        <Command.Empty className="command-empty">
          No bookmarks found.
        </Command.Empty>
        <Command.Group heading={actionLabel} className="command-group">
          {searchableBookmarks.map(({ name, segmentName, change, summary }) => (
            <Command.Item
              key={name}
              value={`${name} ${summary}`}
              keywords={[name, summary, segmentName ?? "working copy"]}
              className="command-item commit-picker-item"
              onSelect={() => onPick({ name, segmentName, change })}
            >
              <span className="commit-picker-main">
                <span className="commit-picker-summary">{name}</span>
              </span>
              <span className="command-detail">
                <ChangeId id={change.changeId} prefix={change.changeIdPrefix} />
                {summary}
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="command-footer">
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <span>navigate</span>
        <kbd>Enter</kbd>
        <span>select</span>
        <kbd>Esc</kbd>
        <span>close</span>
      </div>
    </Command.Dialog>
  );
}
