import type { ChangeInfo } from "../lib/schema";
import { BookmarkPicker, type PickableBookmark } from "./BookmarkPicker";
import { type PickableChange } from "./CommitPicker";
import { CommitPicker } from "./CommitPicker";
import type { ActivePicker, PickerConfig } from "./stackPicker";

function BookmarkSelectPicker({
  pickableBookmarks,
  closePicker,
  setBookmarkMoveTarget,
}: {
  pickableBookmarks: PickableBookmark[];
  closePicker: () => void;
  setBookmarkMoveTarget: (name: string) => void;
}) {
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

function ChangeCommitPicker({
  pickerKey,
  config,
  pickableChanges,
  defaultChangeId,
  closePicker,
  handlePick,
  getDisabledReason,
}: {
  pickerKey: string;
  config: PickerConfig;
  pickableChanges: PickableChange[];
  defaultChangeId?: string;
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getDisabledReason: (change: ChangeInfo) => string | null;
}) {
  return (
    <CommitPicker
      key={pickerKey}
      open
      title={config.title}
      detail={config.detail}
      changes={pickableChanges}
      actionLabel={config.actionLabel}
      defaultChangeId={defaultChangeId}
      getDisabledReason={getDisabledReason}
      onOpenChange={(open) => {
        if (!open) closePicker();
      }}
      onPick={handlePick}
    />
  );
}

function BookmarkDestinationPicker({
  bookmark,
  config,
  pickableChanges,
  closePicker,
  handlePick,
  getDisabledReason,
}: {
  bookmark: string;
  config: PickerConfig;
  pickableChanges: PickableChange[];
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getDisabledReason: (change: ChangeInfo) => string | null;
}) {
  return (
    <ChangeCommitPicker
      pickerKey={`bookmark-move-${bookmark}`}
      config={config}
      pickableChanges={pickableChanges}
      closePicker={closePicker}
      handlePick={handlePick}
      getDisabledReason={getDisabledReason}
    />
  );
}

function SquashSourcePicker({
  config,
  pickableChanges,
  closePicker,
  handlePick,
  getDisabledReason,
}: {
  config: PickerConfig;
  pickableChanges: PickableChange[];
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getDisabledReason: (change: ChangeInfo) => string | null;
}) {
  return (
    <ChangeCommitPicker
      pickerKey="squash-source"
      config={config}
      pickableChanges={pickableChanges}
      closePicker={closePicker}
      handlePick={handlePick}
      getDisabledReason={getDisabledReason}
    />
  );
}

function SquashDestinationPicker({
  source,
  config,
  pickableChanges,
  closePicker,
  handlePick,
  getDisabledReason,
}: {
  source: ChangeInfo;
  config: PickerConfig;
  pickableChanges: PickableChange[];
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getDisabledReason: (change: ChangeInfo) => string | null;
}) {
  return (
    <ChangeCommitPicker
      pickerKey="squash-destination"
      config={config}
      pickableChanges={pickableChanges}
      defaultChangeId={source.parents[0]}
      closePicker={closePicker}
      handlePick={handlePick}
      getDisabledReason={getDisabledReason}
    />
  );
}

function SingleChangePicker({
  action,
  config,
  pickableChanges,
  closePicker,
  handlePick,
  getDisabledReason,
}: {
  action: "abandon" | "absorb" | "describe";
  config: PickerConfig;
  pickableChanges: PickableChange[];
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getDisabledReason: (change: ChangeInfo) => string | null;
}) {
  return (
    <ChangeCommitPicker
      pickerKey={action}
      config={config}
      pickableChanges={pickableChanges}
      closePicker={closePicker}
      handlePick={handlePick}
      getDisabledReason={getDisabledReason}
    />
  );
}

export function StackActionPickers({
  activePicker,
  pickableChanges,
  pickableBookmarks,
  closePicker,
  handlePick,
  getPickerDisabledReason,
  setBookmarkMoveTarget,
}: {
  activePicker: ActivePicker | null;
  pickableChanges: PickableChange[];
  pickableBookmarks: PickableBookmark[];
  closePicker: () => void;
  handlePick: (change: ChangeInfo) => void;
  getPickerDisabledReason: (change: ChangeInfo) => string | null;
  setBookmarkMoveTarget: (name: string) => void;
}) {
  if (!activePicker) return null;

  const shared = {
    pickableChanges,
    closePicker,
    handlePick,
    getDisabledReason: getPickerDisabledReason,
  };

  switch (activePicker.kind) {
    case "bookmark-select":
      return (
        <BookmarkSelectPicker
          pickableBookmarks={pickableBookmarks}
          closePicker={closePicker}
          setBookmarkMoveTarget={setBookmarkMoveTarget}
        />
      );
    case "bookmark-destination":
      return (
        <BookmarkDestinationPicker
          bookmark={activePicker.bookmark}
          config={activePicker.config}
          {...shared}
        />
      );
    case "squash-source":
      return <SquashSourcePicker config={activePicker.config} {...shared} />;
    case "squash-destination":
      return (
        <SquashDestinationPicker
          source={activePicker.source}
          config={activePicker.config}
          {...shared}
        />
      );
    case "single-change":
      return (
        <SingleChangePicker
          action={activePicker.action}
          config={activePicker.config}
          {...shared}
        />
      );
  }
}
