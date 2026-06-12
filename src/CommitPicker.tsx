import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import type { ChangeInfo, StackView } from "../lib/schema";
import { ChangeId } from "./ChangeId";

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
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

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
        placeholder="Search changes..."
        value={search}
        onValueChange={setSearch}
      />
      <Command.List className="command-list commit-picker-list">
        <Command.Empty className="command-empty">
          No changes found.
        </Command.Empty>
        <Command.Group heading={actionLabel} className="command-group">
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
