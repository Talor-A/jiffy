import { useMemo } from "react";
import { Command } from "cmdk";
import type { ChangeInfo, StackView } from "../lib/schema";
import { ChangeId } from "./ChangeId";
import { SearchPicker } from "./SearchPicker";

export interface PickableChange {
  change: ChangeInfo;
  segmentName: string | null;
}

/** cmdk identity for an item; defaultValue must produce the same string. */
function itemValue(change: ChangeInfo, summary: string): string {
  return `${change.changeIdPrefix} ${summary}`;
}

export function flattenStackChanges(stack: StackView | null): PickableChange[] {
  if (!stack) return [];
  return stack.segments.flatMap((segment) =>
    segment.changes.map((change) => ({
      change,
      segmentName: segment.name,
    })),
  );
}

export function CommitPicker({
  open,
  title,
  detail,
  changes,
  actionLabel,
  defaultChangeId,
  onPick,
  onOpenChange,
  getDisabledReason,
}: {
  open: boolean;
  title: string;
  detail: string;
  changes: PickableChange[];
  actionLabel: string;
  /** Change highlighted when the picker opens (falls back to the first item). */
  defaultChangeId?: string;
  onPick: (change: ChangeInfo) => void;
  onOpenChange: (open: boolean) => void;
  getDisabledReason?: (change: ChangeInfo) => string | null;
}) {
  const searchableChanges = useMemo(
    () =>
      changes.map((item) => {
        const summary =
          item.change.description.split("\n", 1)[0]?.trim() ||
          "(no description)";
        return { ...item, summary };
      }),
    [changes],
  );

  // The parent decides whether picking closes the dialog — two-step flows
  // (e.g. squash source → destination) keep it open between picks.
  const pick = (change: ChangeInfo) => {
    if (getDisabledReason?.(change)) return;
    onPick(change);
  };

  const defaultValue = useMemo(() => {
    const item = searchableChanges.find(
      (i) => i.change.changeId === defaultChangeId,
    );
    return item ? itemValue(item.change, item.summary) : undefined;
  }, [searchableChanges, defaultChangeId]);

  return (
    <SearchPicker.Root
      open={open}
      title={title}
      defaultValue={defaultValue}
      panelClassName="modal-panel command-panel commit-picker-panel"
      onOpenChange={onOpenChange}
    >
      <SearchPicker.Header title={title} detail={detail} />
      <SearchPicker.Input placeholder="Search changes..." />
      <SearchPicker.List
        emptyMessage="No changes found."
        listClassName="command-list commit-picker-list"
      >
        <SearchPicker.Group heading={actionLabel}>
          {searchableChanges.map(({ change, segmentName, summary }) => {
            const disabledReason = getDisabledReason?.(change);
            return (
              <Command.Item
                key={change.changeId}
                value={itemValue(change, summary)}
                keywords={[
                  change.changeId,
                  change.commitId,
                  summary,
                  segmentName ?? "working copy",
                ]}
                disabled={disabledReason !== null && disabledReason !== undefined}
                className="command-item commit-picker-item"
                onSelect={() => pick(change)}
              >
                <span className="commit-picker-main">
                  <ChangeId
                    id={change.changeId}
                    prefix={change.changeIdPrefix}
                  />
                  <span className="commit-picker-summary">{summary}</span>
                </span>
                <span className="command-detail">
                  {disabledReason ??
                    (change.isWorkingCopy ? "@" : segmentName ?? "working copy")}
                </span>
              </Command.Item>
            );
          })}
        </SearchPicker.Group>
      </SearchPicker.List>
      <SearchPicker.Footer />
    </SearchPicker.Root>
  );
}
