import type { ChangeInfo } from "../lib/schema";
import { BookmarkPicker, type PickableBookmark } from "./BookmarkPicker";
import { type PickableChange } from "./CommitPicker";
import { CommitPicker } from "./CommitPicker";
import type { PickerActionKind } from "./stackPicker";

export function StackActionPickers({
  stackAction,
  squashSource,
  bookmarkMoveTarget,
  pickerConfig,
  pickableChanges,
  pickableBookmarks,
  closePicker,
  handlePick,
  getPickerDisabledReason,
  setBookmarkMoveTarget,
}: {
  stackAction: PickerActionKind | null;
  squashSource: ChangeInfo | null;
  bookmarkMoveTarget: string | null;
  pickerConfig: {
    title: string;
    detail: string;
    actionLabel: string;
  } | null;
  pickableChanges: PickableChange[];
  pickableBookmarks: PickableBookmark[];
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getPickerDisabledReason: (change: ChangeInfo) => string | null;
  setBookmarkMoveTarget: (name: string) => void;
}) {
  if (stackAction === "bookmark-move" && !bookmarkMoveTarget) {
    return (
      <BookmarkPicker
        open
        title="Move Bookmark"
        detail="Pick the bookmark to move. You'll pick the destination change next."
        bookmarks={pickableBookmarks}
        actionLabel="Bookmarks"
        onOpenChange={(open) => {
          if (!open) closePicker();
        }}
        onPick={(bookmark) => setBookmarkMoveTarget(bookmark.name)}
      />
    );
  }

  if (!pickerConfig) return null;

  return (
    <CommitPicker
      // Remount between squash/bookmark-move steps so search resets.
      key={
        squashSource
          ? "squash-destination"
          : bookmarkMoveTarget
            ? `bookmark-move-${bookmarkMoveTarget}`
            : stackAction
      }
      open
      title={pickerConfig.title}
      detail={pickerConfig.detail}
      changes={pickableChanges}
      actionLabel={pickerConfig.actionLabel}
      defaultChangeId={squashSource?.parents[0]}
      getDisabledReason={getPickerDisabledReason}
      onOpenChange={(open) => {
        if (!open) closePicker();
      }}
      onPick={handlePick}
    />
  );
}
