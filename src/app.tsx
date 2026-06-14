import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionRequest,
  ChangeInfo,
  Comment,
  DiffResponse,
  RepoInfo,
  StackView,
} from "../lib/schema";
import {
  changeSpec,
  getDiff,
  getRepo,
  getStack,
  listComments,
  onRepoChanged,
  refreshRepo,
  runAction,
  WC_SPEC,
  type DiffSpec,
} from "./api";
import { DiffViewer } from "./DiffViewer";
import { CommandPalette, type PaletteAction } from "./CommandPalette";
import { StackPanel } from "./StackPanel";
import { BookmarkPicker, flattenStackBookmarks } from "./BookmarkPicker";
import { CommitPicker, flattenStackChanges } from "./CommitPicker";
import { HelpModal } from "./HelpModal";
import { formatPageTitle } from "./pageTitle";
import {
  bookmarkMoveDestinationConfig,
  changeLabel,
  squashIntoConfig,
  STACK_ACTION_CONFIG,
  stackActionRequest,
  type PickerActionKind,
} from "./stackPicker";
import { useKeyboardShortcuts } from "./keyboard";

export function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [stack, setStack] = useState<StackView | null>(null);
  const [spec, setSpec] = useState<DiffSpec>(WC_SPEC);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [stackAction, setStackAction] = useState<PickerActionKind | null>(null);
  // Squash picks twice: the source first, then the destination.
  const [squashSource, setSquashSource] = useState<ChangeInfo | null>(null);
  const [bookmarkMoveTarget, setBookmarkMoveTarget] = useState<string | null>(
    null,
  );
  const [pendingDescribe, setPendingDescribe] = useState<{
    changeId: string;
    description: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // While a comment draft is open we don't clobber the diff under the
  // user's cursor; the refetch happens when the draft closes.
  const editingRef = useRef(false);
  const staleWhileEditingRef = useRef(false);

  const loadStack = useCallback(async (snapshot: boolean) => {
    try {
      setStack(await getStack({ snapshot }));
    } catch (e) {
      console.error("stack load failed", e);
    }
  }, []);

  const loadDiff = useCallback(async (target: DiffSpec) => {
    try {
      const [d, c] = await Promise.all([
        getDiff(target.params),
        listComments(),
      ]);
      setDiff(d);
      setComments(c);
      setDiffError(null);
    } catch (e) {
      setDiff(null);
      setDiffError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadComments = useCallback(async () => {
    setComments(await listComments());
  }, []);

  useEffect(() => {
    getRepo().then(setRepo, console.error);
    void loadStack(true);
  }, [loadStack]);

  useEffect(() => {
    setLoading(true);
    void loadDiff(spec);
  }, [spec, loadDiff]);

  useEffect(() => {
    return onRepoChanged(() => {
      void loadStack(false);
      if (editingRef.current) {
        staleWhileEditingRef.current = true;
      } else {
        void loadDiff(spec);
      }
    });
  }, [spec, loadStack, loadDiff]);

  const setEditing = useCallback(
    (editing: boolean) => {
      editingRef.current = editing;
      if (!editing && staleWhileEditingRef.current) {
        staleWhileEditingRef.current = false;
        void loadDiff(spec);
      }
    },
    [spec, loadDiff],
  );

  const handleRefresh = useCallback(async () => {
    await refreshRepo().catch(console.error);
    await loadStack(false);
    await loadDiff(spec);
  }, [spec, loadStack, loadDiff]);

  const runRepoAction = useCallback(
    async (
      request: ActionRequest,
      opts: { viewWorkingCopy?: boolean } = {},
    ) => {
      setActionError(null);
      try {
        await runAction(request);
        await loadStack(false);
        const target = opts.viewWorkingCopy ? WC_SPEC : spec;
        if (opts.viewWorkingCopy) setSpec(WC_SPEC);
        await loadDiff(target);
      } catch (e) {
        setActionError((e as Error).message);
      }
    },
    [loadStack, loadDiff, spec],
  );

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const pickableChanges = useMemo(() => flattenStackChanges(stack), [stack]);
  const pickableBookmarks = useMemo(
    () => flattenStackBookmarks(stack),
    [stack],
  );

  const closePicker = useCallback(() => {
    setStackAction(null);
    setSquashSource(null);
    setBookmarkMoveTarget(null);
  }, []);

  const runStackAction = useCallback(
    async (request: ActionRequest, confirmation: string) => {
      const confirmed = window.confirm(
        `${confirmation}\n\n` +
          "This rewrites jj history. Use `jj op restore` if you need to undo it.",
      );
      if (!confirmed) return;

      setActionError(null);
      try {
        await runAction(request);
        await loadStack(false);
        setSpec(WC_SPEC);
        await loadDiff(WC_SPEC);
      } catch (e) {
        setActionError((e as Error).message);
      }
    },
    [loadStack, loadDiff],
  );

  const handlePick = useCallback(
    (change: ChangeInfo) => {
      if (!stackAction) return;
      if (stackAction === "describe") {
        closePicker();
        setSpec(changeSpec(change));
        setPendingDescribe({
          changeId: change.changeId,
          description: change.description,
        });
        return;
      }
      if (stackAction === "squash") {
        if (!squashSource) {
          // First pick: hold the source; the picker stays open for the
          // destination pick.
          setSquashSource(change);
          return;
        }
        closePicker();
        void runStackAction(
          {
            action: "squash",
            fromChangeId: squashSource.changeId,
            intoChangeId: change.changeId,
            useDestinationMessage: true,
          },
          `Squash ${changeLabel(squashSource)} into ${changeLabel(change)}?`,
        );
        return;
      }
      if (stackAction === "bookmark-move" && bookmarkMoveTarget) {
        closePicker();
        void runStackAction(
          {
            action: "bookmark-move",
            bookmarkName: bookmarkMoveTarget,
            toChangeId: change.changeId,
          },
          `Move bookmark ${bookmarkMoveTarget} to ${changeLabel(change)}?`,
        );
        return;
      }
      closePicker();
      if (stackAction !== "abandon" && stackAction !== "absorb") return;
      void runStackAction(
        stackActionRequest(stackAction, change),
        `${STACK_ACTION_CONFIG[stackAction].confirmVerb} ${changeLabel(change)}?`,
      );
    },
    [
      stackAction,
      squashSource,
      bookmarkMoveTarget,
      closePicker,
      runStackAction,
    ],
  );

  const getPickerDisabledReason = useCallback(
    (change: ChangeInfo): string | null => {
      if (change.immutable) return "immutable";
      if (squashSource && change.changeId === squashSource.changeId) {
        return "source";
      }
      return null;
    },
    [squashSource],
  );

  const pickerConfig = stackAction
    ? stackAction === "bookmark-move" && bookmarkMoveTarget
      ? bookmarkMoveDestinationConfig(bookmarkMoveTarget)
      : squashSource
        ? squashIntoConfig(squashSource)
        : stackAction === "bookmark-move"
          ? null
          : STACK_ACTION_CONFIG[stackAction]
    : null;

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
              onPendingDescribeHandled={() => setPendingDescribe(null)}
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
        {stackAction === "bookmark-move" && !bookmarkMoveTarget ? (
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
        ) : pickerConfig ? (
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
        ) : null}
        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      </div>
    </>
  );
}

