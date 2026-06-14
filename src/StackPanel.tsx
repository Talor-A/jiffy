import type { Comment, StackSegment, StackView } from "../lib/schema";
import { changeSpec, segmentSpec, type DiffSpec } from "./api";
import { ChangeId } from "./ChangeId";
import { ContextMenu, copyItem, type MenuItem } from "./ContextMenu";

export function StackPanel({
  stack,
  activeKey,
  comments,
  onSelect,
}: {
  stack: StackView;
  activeKey: string;
  comments: Comment[];
  onSelect: (spec: DiffSpec) => void;
}) {
  const commentCounts = countBySpec(comments);

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

function countBySpec(comments: Comment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of comments) {
    counts.set(c.specKey, (counts.get(c.specKey) ?? 0) + 1);
  }
  return counts;
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
          <span className="segment-name">
            {segment.name ?? "local changes"}
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
      </ContextMenu>
      <ul className="segment-changes">
        {segment.changes.map((change) => {
          const cs = changeSpec(change);
          const summary = change.description.split("\n", 1)[0]?.trim() || "";
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
