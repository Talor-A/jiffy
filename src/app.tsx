import { useCallback, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { AppMain, AppSidebar } from "./AppLayout";
import { StackActionPickers } from "./StackActionPickers";
import { formatPageTitle } from "./pageTitle";
import { useKeyboardShortcuts } from "./keyboard";
import { HelpProvider, RepoProvider, useRepo } from "./RepoContext";
import { useStackPicker } from "./useStackPicker";
import { usePaletteActions } from "./usePaletteActions";

function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { state, actions, meta } = useRepo();
  const { repo, stack, spec } = state;
  const { setSpec, setActionError, loadStack, loadDiff } = actions;

  const {
    setStackAction,
    pendingDescribe,
    clearPendingDescribe,
    pickableChanges,
    pickableBookmarks,
    activePicker,
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

  useKeyboardShortcuts({
    editingRef: meta.editingRef,
    paletteOpen,
    onOpenPalette: openPalette,
    onClosePalette: closePalette,
  });

  const paletteActions = usePaletteActions({
    setStackAction,
    pickableChangesCount: pickableChanges.length,
    pickableBookmarksCount: pickableBookmarks.length,
  });

  return (
    <>
      <title>{formatPageTitle(spec.label, repo)}</title>
      <div className="app">
        <AppSidebar />
        <AppMain
          pendingDescribe={pendingDescribe}
          onPendingDescribeHandled={clearPendingDescribe}
        />
        <CommandPalette
          open={paletteOpen}
          actions={paletteActions}
          onOpenChange={setPaletteOpen}
        />
        <StackActionPickers
          activePicker={activePicker}
          pickableChanges={pickableChanges}
          pickableBookmarks={pickableBookmarks}
          closePicker={closePicker}
          handlePick={handlePick}
          getPickerDisabledReason={getPickerDisabledReason}
          setBookmarkMoveTarget={setBookmarkMoveTarget}
        />
      </div>
    </>
  );
}

export function App() {
  return (
    <RepoProvider>
      <HelpProvider>
        <AppShell />
      </HelpProvider>
    </RepoProvider>
  );
}
