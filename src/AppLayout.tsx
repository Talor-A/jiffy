import type { Comment, DiffResponse, RepoInfo, StackView } from "../lib/schema";
import type { DiffSpec } from "./api";
import { DiffViewer } from "./DiffViewer";
import { StackPanel } from "./StackPanel";

export function AppSidebar({
  repo,
  stack,
  spec,
  comments,
  onSelect,
  onOpenHelp,
}: {
  repo: RepoInfo | null;
  stack: StackView | null;
  spec: DiffSpec;
  comments: Comment[];
  onSelect: (spec: DiffSpec) => void;
  onOpenHelp: () => void;
}) {
  return (
    <aside className="sidebar">
      <header className="repo-header">
        <h1>jiffy</h1>
        <button
          className="ghost help-button"
          title="what is this?"
          onClick={onOpenHelp}
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
          onSelect={onSelect}
        />
      )}
    </aside>
  );
}

export function AppMain({
  actionError,
  diffError,
  loading,
  spec,
  diff,
  comments,
  pendingDescribe,
  onPendingDescribeHandled,
  onCommentsChanged,
  onEditingChanged,
}: {
  actionError: string | null;
  diffError: string | null;
  loading: boolean;
  spec: DiffSpec;
  diff: DiffResponse | null;
  comments: Comment[];
  pendingDescribe: { changeId: string; description: string } | null;
  onPendingDescribeHandled: () => void;
  onCommentsChanged: () => Promise<void>;
  onEditingChanged: (editing: boolean) => void;
}) {
  return (
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
          onPendingDescribeHandled={onPendingDescribeHandled}
          onCommentsChanged={onCommentsChanged}
          onEditingChanged={onEditingChanged}
        />
      )}
    </main>
  );
}
