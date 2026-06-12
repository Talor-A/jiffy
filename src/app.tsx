import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionRequest,
  ChangeInfo,
  Comment,
  DiffResponse,
  RepoInfo,
  StackSegment,
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
  segmentSpec,
  WC_SPEC,
  type DiffSpec,
} from "./api";
import { DiffViewer } from "./DiffViewer";
import { ChangeId } from "./ChangeId";
import { CommandPalette, type PaletteAction } from "./CommandPalette";
import { CommitPicker, flattenStackChanges } from "./CommitPicker";
import { ContextMenu, copyItem, type MenuItem } from "./ContextMenu";
import { HelpModal } from "./HelpModal";
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
  const [stackAction, setStackAction] = useState<StackActionKind | null>(null);
  // Squash picks twice: the source first, then the destination.
  const [squashSource, setSquashSource] = useState<ChangeInfo | null>(null);
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
    async (request: ActionRequest) => {
      setActionError(null);
      try {
        await runAction(request);
        await loadStack(false);
        await loadDiff(spec);
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

  const closePicker = useCallback(() => {
    setStackAction(null);
    setSquashSource(null);
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
      closePicker();
      void runStackAction(
        stackActionRequest(stackAction, change),
        `${STACK_ACTION_CONFIG[stackAction].confirmVerb} ${changeLabel(change)}?`,
      );
    },
    [stackAction, squashSource, closePicker, runStackAction],
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
    ? squashSource
      ? squashIntoConfig(squashSource)
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
        label: "View working copy",
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
    [handleRefresh, pickableChanges.length, repo, runRepoAction, stack?.hasUnpushedWork],
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
              commentCounts={countBySpec(comments)}
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
        {pickerConfig && (
          <CommitPicker
            // Remount between squash steps so search and selection reset.
            key={squashSource ? "squash-destination" : stackAction}
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
        )}
        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      </div>
    </>
  );
}

type StackActionKind = "abandon" | "absorb" | "squash" | "describe";

const STACK_ACTION_CONFIG: Record<
  StackActionKind,
  {
    title: string;
    detail: string;
    actionLabel: string;
    confirmVerb: string;
  }
> = {
  abandon: {
    title: "Abandon Change",
    detail:
      "Pick one mutable change to abandon. Descendants will be rebased by jj.",
    actionLabel: "Abandon",
    confirmVerb: "Abandon",
  },
  absorb: {
    title: "Absorb Change",
    detail:
      "Pick a source change; jj will move edits into the mutable ancestors that last touched those lines.",
    actionLabel: "Absorb",
    confirmVerb: "Absorb from",
  },
  squash: {
    title: "Squash: Pick Source",
    detail:
      "Pick the change to squash. You'll pick the destination it folds into next.",
    actionLabel: "Squash",
    confirmVerb: "Squash",
  },
  describe: {
    title: "Describe Change",
    detail: "Pick a mutable change to edit its description.",
    actionLabel: "Describe",
    confirmVerb: "Describe",
  },
};

function squashIntoConfig(source: ChangeInfo): {
  title: string;
  detail: string;
  actionLabel: string;
} {
  return {
    title: "Squash: Pick Destination",
    detail: `Move ${changeLabel(source)} into the destination, keeping the destination's description.`,
    actionLabel: "Squash into",
  };
}

function changeLabel(change: ChangeInfo): string {
  const summary =
    change.description.split("\n", 1)[0]?.trim() || "(no description)";
  return `${change.changeIdPrefix} "${summary}"`;
}

function stackActionRequest(
  kind: "abandon" | "absorb",
  change: ChangeInfo,
): ActionRequest {
  switch (kind) {
    case "abandon":
      return { action: "abandon", changeIds: [change.changeId] };
    case "absorb":
      return { action: "absorb", changeId: change.changeId };
  }
}

function repoDisplayName(repo: RepoInfo): string {
  return repo.github?.nameWithOwner ?? repo.root.split("/").pop() ?? repo.root;
}

function formatPageTitle(viewLabel: string, repo: RepoInfo | null): string {
  return [viewLabel, repo ? repoDisplayName(repo) : null, "jiffy"]
    .filter(Boolean)
    .join(" · ");
}

function countBySpec(comments: Comment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of comments) {
    counts.set(c.specKey, (counts.get(c.specKey) ?? 0) + 1);
  }
  return counts;
}

function StackPanel({
  stack,
  activeKey,
  commentCounts,
  onSelect,
}: {
  stack: StackView;
  activeKey: string;
  commentCounts: Map<string, number>;
  onSelect: (spec: DiffSpec) => void;
}) {
  return (
    <div className="stack">
      <div className="stack-title">stack</div>
      {stack.segments.length === 0 && (
        <div className="stack-empty">working copy is on {stack.trunkName}</div>
      )}
      {stack.segments.map((segment) => (
        <SegmentCard
          key={segment.headChangeId}
          segment={segment}
          activeKey={activeKey}
          commentCounts={commentCounts}
          onSelect={onSelect}
        />
      ))}
      <ContextMenu
        items={[
          copyItem("copy bookmark name", stack.trunkName),
          ...(stack.trunkChange
            ? [copyItem("copy commit sha", stack.trunkChange.commitId)]
            : []),
        ]}
      >
        <div className="trunk-row" title="immutable base">
          <span className="trunk-icon">◆</span> {stack.trunkName}
        </div>
      </ContextMenu>
    </div>
  );
}

const PUSH_STATUS_LABEL: Record<string, { dot: string; label: string }> = {
  synced: { dot: "dot-synced", label: "in sync with origin" },
  outdated: { dot: "dot-outdated", label: "bookmark moved — needs push" },
  unpushed: { dot: "dot-unpushed", label: "never pushed" },
};

function SegmentCard({
  segment,
  activeKey,
  commentCounts,
  onSelect,
}: {
  segment: StackSegment;
  activeKey: string;
  commentCounts: Map<string, number>;
  onSelect: (spec: DiffSpec) => void;
}) {
  const spec = segmentSpec(segment);
  const status = segment.pushStatus
    ? PUSH_STATUS_LABEL[segment.pushStatus]
    : null;
  const segCommentCount = commentCounts.get(spec.key) ?? 0;

  const segmentMenuItems: MenuItem[] = [
    ...segment.bookmarks.map((b) =>
      copyItem(
        segment.bookmarks.length > 1 ? `copy "${b}"` : "copy bookmark name",
        b,
      ),
    ),
    ...(segment.pr ? [copyItem("copy PR url", segment.pr.url)] : []),
    copyItem("copy head change id", segment.headChangeId),
  ];

  return (
    <section className={activeKey === spec.key ? "segment active" : "segment"}>
      <ContextMenu items={segmentMenuItems}>
        <header className="segment-header" onClick={() => onSelect(spec)}>
          {status && (
            <span className={`dot ${status.dot}`} title={status.label} />
          )}
          <span className="segment-name">{segment.name ?? "working copy"}</span>
          {segCommentCount > 0 && (
            <span className="badge badge-comments">{segCommentCount}</span>
          )}
          {segment.pr && (
            <a
              className={segment.pr.isDraft ? "pr-link draft" : "pr-link"}
              href={segment.pr.url}
              target="_blank"
              rel="noreferrer"
              title={segment.pr.title}
              onClick={(e) => e.stopPropagation()}
            >
              #{segment.pr.number}
            </a>
          )}
        </header>
      </ContextMenu>
      <ul className="segment-changes">
        {segment.changes.map((change) => {
          const cs = changeSpec(change);
          const summary =
            change.description.split("\n", 1)[0]?.trim() || "(no description)";
          const count = commentCounts.get(cs.key) ?? 0;
          const changeMenuItems: MenuItem[] = [
            copyItem("copy change id", change.changeId),
            copyItem("copy commit sha", change.commitId),
            ...(change.description.trim()
              ? [copyItem("copy description", change.description)]
              : []),
          ];
          return (
            <ContextMenu key={change.changeId} items={changeMenuItems}>
              <li
                className={activeKey === cs.key ? "change active" : "change"}
                onClick={() => onSelect(cs)}
                title={change.description || undefined}
              >
                <ChangeId id={change.changeId} prefix={change.changeIdPrefix} />
                <span className="change-summary">{summary}</span>
                {change.isWorkingCopy && <span className="wc-marker">@</span>}
                {change.empty ? (
                  <span className="empty-marker">empty</span>
                ) : (
                  <span className="file-count">{change.fileCount}</span>
                )}
                {count > 0 && (
                  <span className="badge badge-comments">{count}</span>
                )}
              </li>
            </ContextMenu>
          );
        })}
      </ul>
    </section>
  );
}
