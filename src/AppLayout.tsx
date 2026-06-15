import { Dialog } from "@base-ui/react";
import { DiffViewer } from "./DiffViewer";
import { StackPanel } from "./StackPanel";
import { HelpModal } from "./HelpModal";
import { useHelp, useRepo } from "./RepoContext";

export function AppSidebar() {
  const { state, actions } = useRepo();
  const { repo, stack, spec, comments } = state;
  const { setSpec } = actions;
  const { helpOpen, setHelpOpen } = useHelp();

  return (
    <aside className="sidebar">
      <header className="repo-header">
        <h1>jiffy</h1>
        <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
          <Dialog.Trigger
            type="button"
            className="ghost help-button"
            title="what is this?"
          >
            ?
          </Dialog.Trigger>
          <HelpModal />
        </Dialog.Root>
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
    </aside>
  );
}

export function AppMain({
  pendingDescribe,
  onPendingDescribeHandled,
}: {
  pendingDescribe: { changeId: string; description: string } | null;
  onPendingDescribeHandled: () => void;
}) {
  const { state, actions } = useRepo();
  const { actionError, diffError, loading, spec, diff, comments } = state;
  const { reloadComments, setEditing } = actions;

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
          onCommentsChanged={reloadComments}
          onEditingChanged={setEditing}
        />
      )}
    </main>
  );
}
