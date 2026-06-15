import { useMemo } from "react";
import { Command } from "cmdk";
import type { ChangeInfo, StackView } from "../lib/schema";
import { ChangeId } from "./ChangeId";
import { summaryLine } from "../lib/stack";
import { SearchPicker } from "./SearchPicker";

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
    <SearchPicker.Root
      open={open}
      title={title}
      defaultValue={defaultValue}
      panelClassName="modal-panel command-panel commit-picker-panel"
      onOpenChange={onOpenChange}
    >
      <SearchPicker.Header title={title} detail={detail} />
      <SearchPicker.Input placeholder="Search bookmarks..." />
      <SearchPicker.List
        emptyMessage="No bookmarks found."
        listClassName="command-list commit-picker-list"
      >
        <SearchPicker.Group heading={actionLabel}>
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
        </SearchPicker.Group>
      </SearchPicker.List>
      <SearchPicker.Footer />
    </SearchPicker.Root>
  );
}
