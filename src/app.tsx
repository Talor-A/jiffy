import { useCallback, useState } from "react";
import { DiffViewer } from "./DiffViewer";
import { CommandPalette } from "./CommandPalette";
import { StackPanel } from "./StackPanel";
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
        <aside className="sidebar">
          <header className="repo-header">
            <h1>jiffy</h1>
            <button
              className="ghost help-button"
              title="what is this?"
              onClick={() => setHelpOpen(true)}
            >
              ?
            </button>
            {repo && (
              <div className="repo-name" title={repo.root}>
                {repo.github ? (
                  <a href={repo.github.url} target="_blank" rel="noreferrer">
                    {repo.github.nameWithOwner}
                  </a>
                ) : (
                  repo.root.split("/").pop()
                )}
              </div>
            )}
            {stack?.hasUnpushedWork && (
              <span
                className="badge badge-unpushed"
                title="Local work not on the remote yet"
              >
                unpushed work
              </span>
            )}
          </header>

          {stack && (
            <StackPanel
              stack={stack}
              activeKey={spec.key}
              comments={comments}
              onSelect={setSpec}
            />
          )}

          {/*<footer className="sidebar-footer">

          </footer>*/}
        </aside>

        <main className="main">
          {actionError && <div className="error-banner">{actionError}</div>}
          {diffError && <div className="error-banner">{diffError}</div>}
          {loading && !diff && <div className="placeholder">loading…</div>}
          {diff && (
            <DiffViewer
              spec={spec}
              diff={diff}
              comments={comments.filter((c) => c.specKey === spec.key)}
              allCommentCount={comments.length}
              pendingDescribe={pendingDescribe}
              onPendingDescribeHandled={clearPendingDescribe}
              onCommentsChanged={reloadComments}
              onEditingChanged={setEditing}
            />
          )}
        </main>
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

