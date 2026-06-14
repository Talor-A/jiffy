import { useCallback, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { AppMain, AppSidebar } from "./AppLayout";
import { StackActionPickers } from "./StackActionPickers";
import { HelpModal } from "./HelpModal";
import { formatPageTitle } from "./pageTitle";
import { useKeyboardShortcuts } from "./keyboard";
import { useRepoData } from "./useRepoData";
import { useStackPicker } from "./useStackPicker";
import { usePaletteActions } from "./usePaletteActions";

export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    repo,
    stack,
    spec,
    setSpec,
    diff,
    diffError,
    comments,
    loading,
    editingRef,
    setEditing,
    reloadComments,
    handleRefresh,
    runRepoAction,
    loadStack,
    loadDiff,
  } = useRepoData({ onActionError: setActionError });

  const {
    stackAction,
    setStackAction,
    pendingDescribe,
    clearPendingDescribe,
    pickableChanges,
    pickableBookmarks,
    squashSource,
    bookmarkMoveTarget,
    pickerConfig,
    closePicker,
    handlePick,
    getPickerDisabledReason,
    setBookmarkMoveTarget,
  } = useStackPicker({
    stack,
    setSpec,
    loadStack,
    loadDiff,
    onActionError: setActionError,
  });

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useKeyboardShortcuts({
    editingRef,
    paletteOpen,
    helpOpen,
    onOpenPalette: openPalette,
    onClosePalette: closePalette,
    onCloseHelp: closeHelp,
  });

  const paletteActions = usePaletteActions({
    repo,
    stack,
    pickableChangesCount: pickableChanges.length,
    pickableBookmarksCount: pickableBookmarks.length,
    setSpec,
    setHelpOpen,
    setStackAction,
    runRepoAction,
    handleRefresh,
  });

  return (
    <>
      <title>{formatPageTitle(spec.label, repo)}</title>
      <div className="app">
        <AppSidebar
          repo={repo}
          stack={stack}
          spec={spec}
          comments={comments}
          onSelect={setSpec}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <AppMain
          actionError={actionError}
          diffError={diffError}
          loading={loading}
          spec={spec}
          diff={diff}
          comments={comments}
          pendingDescribe={pendingDescribe}
          onPendingDescribeHandled={clearPendingDescribe}
          onCommentsChanged={reloadComments}
          onEditingChanged={setEditing}
        />
        <CommandPalette
          open={paletteOpen}
          actions={paletteActions}
          onOpenChange={setPaletteOpen}
        />
        <StackActionPickers
          stackAction={stackAction}
          squashSource={squashSource}
          bookmarkMoveTarget={bookmarkMoveTarget}
          pickerConfig={pickerConfig}
          pickableChanges={pickableChanges}
          pickableBookmarks={pickableBookmarks}
          closePicker={closePicker}
          handlePick={handlePick}
          getPickerDisabledReason={getPickerDisabledReason}
          setBookmarkMoveTarget={setBookmarkMoveTarget}
        />
        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      </div>
    </>
  );
}
