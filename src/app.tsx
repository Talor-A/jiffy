import { useCallback, useEffect, useRef, useState } from "react";
import type {
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
  LATEST_SPEC,
  listComments,
  onRepoChanged,
  refreshRepo,
  segmentSpec,
  WC_SPEC,
  type DiffSpec,
} from "./api";
import { DiffViewer } from "./DiffViewer";
import { ChangeId } from "./ChangeId";
import { useContextMenu, type MenuItem, type OpenMenu } from "./ContextMenu";
import { HelpModal } from "./HelpModal";

export function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [stack, setStack] = useState<StackView | null>(null);
  const [spec, setSpec] = useState<DiffSpec>(WC_SPEC);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const { menu, open: openMenu } = useContextMenu();

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

  return (
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
            <span className="badge badge-unpushed" title="Local work not on the remote yet">
              unpushed work
            </span>
          )}
        </header>

        <nav className="quick-views">
          {[WC_SPEC, LATEST_SPEC].map((quick) => (
            <button
              key={quick.key}
              className={spec.key === quick.key ? "quick active" : "quick"}
              onClick={() => setSpec(quick)}
            >
              {quick.label}
            </button>
          ))}
        </nav>

        {stack && (
          <StackPanel
            stack={stack}
            activeKey={spec.key}
            commentCounts={countBySpec(comments)}
            onSelect={setSpec}
            openMenu={openMenu}
          />
        )}

        <footer className="sidebar-footer">
          <button className="ghost" onClick={() => void handleRefresh()}>
            ↻ refresh
          </button>
        </footer>
      </aside>

      <main className="main">
        {diffError && <div className="error-banner">{diffError}</div>}
        {loading && !diff && <div className="placeholder">loading…</div>}
        {diff && (
          <DiffViewer
            spec={spec}
            diff={diff}
            comments={comments.filter((c) => c.specKey === spec.key)}
            allCommentCount={comments.length}
            onCommentsChanged={reloadComments}
            onEditingChanged={setEditing}
            openMenu={openMenu}
          />
        )}
      </main>
      {menu}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
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
  openMenu,
}: {
  stack: StackView;
  activeKey: string;
  commentCounts: Map<string, number>;
  onSelect: (spec: DiffSpec) => void;
  openMenu: OpenMenu;
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
          openMenu={openMenu}
        />
      ))}
      <div
        className="trunk-row"
        title="immutable base"
        onContextMenu={(e) =>
          openMenu(e, [
            { label: "copy bookmark name", value: stack.trunkName },
            ...(stack.trunkChange
              ? [
                  {
                    label: "copy commit sha",
                    value: stack.trunkChange.commitId,
                  },
                ]
              : []),
          ])
        }
      >
        <span className="trunk-icon">◆</span> {stack.trunkName}
      </div>
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
  openMenu,
}: {
  segment: StackSegment;
  activeKey: string;
  commentCounts: Map<string, number>;
  onSelect: (spec: DiffSpec) => void;
  openMenu: OpenMenu;
}) {
  const spec = segmentSpec(segment);
  const status = segment.pushStatus
    ? PUSH_STATUS_LABEL[segment.pushStatus]
    : null;
  const segCommentCount = commentCounts.get(spec.key) ?? 0;

  const segmentMenuItems: MenuItem[] = [
    ...segment.bookmarks.map((b) => ({
      label: segment.bookmarks.length > 1 ? `copy "${b}"` : "copy bookmark name",
      value: b,
    })),
    ...(segment.pr ? [{ label: "copy PR url", value: segment.pr.url }] : []),
    { label: "copy head change id", value: segment.headChangeId },
  ];

  return (
    <section
      className={activeKey === spec.key ? "segment active" : "segment"}
    >
      <header
        className="segment-header"
        onClick={() => onSelect(spec)}
        onContextMenu={(e) => openMenu(e, segmentMenuItems)}
      >
        {status && <span className={`dot ${status.dot}`} title={status.label} />}
        <span className="segment-name">
          {segment.name ?? "working copy"}
        </span>
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
      <ul className="segment-changes">
        {segment.changes.map((change) => {
          const cs = changeSpec(change);
          const summary =
            change.description.split("\n", 1)[0]?.trim() || "(no description)";
          const count = commentCounts.get(cs.key) ?? 0;
          const changeMenuItems: MenuItem[] = [
            { label: "copy change id", value: change.changeId },
            { label: "copy commit sha", value: change.commitId },
            ...(change.description.trim()
              ? [{ label: "copy description", value: change.description }]
              : []),
          ];
          return (
            <li
              key={change.changeId}
              className={activeKey === cs.key ? "change active" : "change"}
              onClick={() => onSelect(cs)}
              onContextMenu={(e) => openMenu(e, changeMenuItems)}
              title={change.description || undefined}
            >
              <ChangeId id={change.changeId} prefix={change.changeIdPrefix} />
              <span className="change-summary">{summary}</span>
              {change.isWorkingCopy && <span className="wc-marker">@</span>}
              {change.empty
                ? <span className="empty-marker">empty</span>
                : <span className="file-count">{change.fileCount}</span>}
              {count > 0 && <span className="badge badge-comments">{count}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
