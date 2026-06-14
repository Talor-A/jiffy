import { useCallback, useMemo, useState } from "react";
import { WC_SPEC } from "./api";
import { DiffViewer } from "./DiffViewer";
import { CommandPalette, type PaletteAction } from "./CommandPalette";
import { StackPanel } from "./StackPanel";
import { StackActionPickers } from "./StackActionPickers";
import { HelpModal } from "./HelpModal";
import { formatPageTitle } from "./pageTitle";
import { useKeyboardShortcuts } from "./keyboard";
import { useRepoData } from "./useRepoData";
import { useStackPicker } from "./useStackPicker";

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

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "working-copy",
        label: "View local changes",
        keywords: ["diff", "wc", "at"],
        run: () => setSpec(WC_SPEC),
      },
      {
        id: "open-help",
        label: "Open help",
        keywords: ["keyboard", "shortcuts", "docs"],
        run: () => setHelpOpen(true),
      },
      {
        id: "open-github",
        label: "Open repository on GitHub",
        keywords: ["repo", "remote", "browser"],
        detail: repo?.github ? repo.github.nameWithOwner : "No GitHub remote",
        disabled: !repo?.github,
        run: () => {
          if (repo?.github)
            window.open(repo.github.url, "_blank", "noreferrer");
        },
      },
      {
        id: "open-pr-url",
        label: "Open PR by URL",
        keywords: ["review", "external", "github"],
        detail: "Coming in #5",
        disabled: true,
        run: () => {},
      },
      {
        id: "describe-change",
        label: "Describe change...",
        keywords: ["stack", "commit", "picker", "message", "edit", "jj"],
        detail: pickableChanges.length ? "Pick one change" : "No stack changes",
        disabled: pickableChanges.length === 0,
        run: () => setStackAction("describe"),
      },
      {
        id: "abandon-change",
        label: "Abandon change...",
        keywords: ["stack", "commit", "picker", "delete", "drop"],
        detail: pickableChanges.length ? "Pick one change" : "No stack changes",
        disabled: pickableChanges.length === 0,
        run: () => setStackAction("abandon"),
      },
      {
        id: "absorb-change",
        label: "Absorb change...",
        keywords: ["stack", "commit", "picker", "fold"],
        detail: pickableChanges.length
          ? "Pick source change"
          : "No stack changes",
        disabled: pickableChanges.length === 0,
        run: () => setStackAction("absorb"),
      },
      {
        id: "squash-change",
        label: "Squash change...",
        keywords: ["stack", "commit", "picker", "combine", "parent", "fold"],
        detail: pickableChanges.length
          ? "Pick source, then destination"
          : "No stack changes",
        disabled: pickableChanges.length === 0,
        run: () => setStackAction("squash"),
      },
      {
        id: "split-change",
        label: "Split change...",
        keywords: ["stack", "commit", "picker", "hunk"],
        detail: "Deferred to #9",
        disabled: true,
        run: () => {},
      },
      {
        id: "launch-agent",
        label: "Launch agent...",
        keywords: ["feedback", "comments"],
        detail: "Planned",
        disabled: true,
        run: () => {},
      },
      {
        id: "new-change",
        label: "New change",
        keywords: ["stack", "commit", "empty", "jj"],
        detail: "jj new",
        run: () => runRepoAction({ action: "new" }, { viewWorkingCopy: true }),
      },
      {
        id: "bookmark-move",
        label: "Move bookmark...",
        keywords: ["bookmark", "backwards", "jj"],
        detail: pickableBookmarks.length
          ? "Pick bookmark, then destination"
          : "No bookmarks in stack",
        disabled: pickableBookmarks.length === 0,
        run: () => setStackAction("bookmark-move"),
      },
      {
        id: "tug",
        label: "Tug bookmarks",
        keywords: ["bookmark", "move", "pushable", "jj"],
        detail: "jj tug",
        run: () => runRepoAction({ action: "tug" }),
      },
      {
        id: "git-push",
        label: "Push to remote",
        keywords: ["push", "origin", "github", "sync", "jj"],
        detail: stack?.hasUnpushedWork ? "jj git push" : "Nothing to push",
        disabled: !stack?.hasUnpushedWork,
        run: () => runRepoAction({ action: "git-push" }),
      },
      {
        id: "refresh",
        label: "Refresh repository",
        keywords: ["reload", "snapshot", "jj"],
        run: handleRefresh,
      },
    ],
    [
      handleRefresh,
      pickableBookmarks.length,
      pickableChanges.length,
      repo,
      runRepoAction,
      stack?.hasUnpushedWork,
    ],
  );

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

