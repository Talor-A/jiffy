import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff, type DiffLineAnnotation } from "@pierre/diffs/react";
import type {
  Comment,
  CommentSide,
  DiffEndpoint,
  DiffResponse,
} from "../lib/schema";
import { ChangeId } from "./ChangeId";
import type { OpenMenu } from "./ContextMenu";
import {
  addComment,
  clearComments,
  deleteComment,
  exportFeedback,
  updateComment,
  type DiffSpec,
} from "./api";
import { FileTreePanel } from "./FileTreePanel";

type AnnoMeta =
  | { kind: "thread"; comments: Comment[] }
  | { kind: "draft" };

interface Draft {
  file: string;
  side: CommentSide;
  line: number;
  codeLine: string | null;
}

export function DiffViewer({
  spec,
  diff,
  comments,
  allCommentCount,
  onCommentsChanged,
  onEditingChanged,
  openMenu,
}: {
  spec: DiffSpec;
  diff: DiffResponse;
  /** Comments scoped to this spec. */
  comments: Comment[];
  allCommentCount: number;
  onCommentsChanged: () => Promise<void>;
  onEditingChanged: (editing: boolean) => void;
  openMenu: OpenMenu;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [treeOpen, setTreeOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const fileRefs = useRef(new Map<string, HTMLDivElement>());

  const files = useMemo(
    () => parsePatchFiles(diff.patch).flatMap((p) => p.files),
    [diff.patch],
  );

  // Close any draft when switching views.
  useEffect(() => {
    setDraft(null);
    onEditingChanged(false);
  }, [spec.key, onEditingChanged]);

  const openDraft = useCallback(
    (d: Draft) => {
      setDraft(d);
      onEditingChanged(true);
    },
    [onEditingChanged],
  );

  const closeDraft = useCallback(() => {
    setDraft(null);
    onEditingChanged(false);
  }, [onEditingChanged]);

  const saveDraft = useCallback(
    async (text: string) => {
      if (!draft) return;
      await addComment({
        specKey: spec.key,
        specLabel: spec.label,
        file: draft.file,
        side: draft.side,
        line: draft.line,
        codeLine: draft.codeLine,
        text,
      });
      await onCommentsChanged();
      closeDraft();
    },
    [draft, spec, onCommentsChanged, closeDraft],
  );

  const handleCopyFeedback = useCallback(async () => {
    const { markdown } = await exportFeedback();
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleClear = useCallback(async () => {
    if (!confirm("Delete all review comments?")) return;
    await clearComments();
    await onCommentsChanged();
  }, [onCommentsChanged]);

  const scrollToFile = useCallback((name: string) => {
    fileRefs.current.get(name)?.scrollIntoView({ block: "start" });
  }, []);

  const stats = useMemo(() => fileStats(files), [files]);

  return (
    <div className="diff-viewer">
      <header className="diff-header">
        <div className="diff-title">
          <span className="diff-label" title={spec.label}>
            {spec.label}
          </span>
          <DiffEndpoints diff={diff} specLabel={spec.label} />
        </div>
        <div className="diff-meta">
          <span className="stat">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
          <span className="stat additions">+{stats.additions}</span>
          <span className="stat deletions">−{stats.deletions}</span>
          <button
            className="ghost"
            onClick={() => setTreeOpen((open) => !open)}
            title={treeOpen ? "hide the file tree" : "show the file tree"}
          >
            {treeOpen ? "⊟ files" : "⊞ files"}
          </button>
          <button
            className="ghost"
            onClick={() =>
              setDiffStyle((s) => (s === "unified" ? "split" : "unified"))
            }
          >
            {diffStyle === "unified" ? "split view" : "unified view"}
          </button>
          <button
            className="primary"
            disabled={allCommentCount === 0}
            onClick={() => void handleCopyFeedback()}
            title="Copy all comments as agent-ready markdown"
          >
            {copied ? "copied ✓" : `copy feedback (${allCommentCount})`}
          </button>
          {allCommentCount > 0 && (
            <button className="ghost danger" onClick={() => void handleClear()}>
              clear
            </button>
          )}
        </div>
      </header>

      {files.length === 0 ? (
        <div className="placeholder">no changes in this view</div>
      ) : (
        <div className="diff-body">
          {treeOpen && (
            <FileTreePanel files={files} onSelectFile={scrollToFile} />
          )}
          <div className="diff-files">
            {files.map((file) => (
              <FileDiffCard
                key={file.name}
                file={file}
                openMenu={openMenu}
                diffStyle={diffStyle}
                comments={comments.filter((c) => c.file === file.name)}
                draft={draft?.file === file.name ? draft : null}
                onOpenDraft={openDraft}
                onCloseDraft={closeDraft}
                onSaveDraft={saveDraft}
                onCommentsChanged={onCommentsChanged}
                registerRef={(el) => {
                  if (el) fileRefs.current.set(file.name, el);
                  else fileRefs.current.delete(file.name);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function summaryOf(endpoint: DiffEndpoint): string {
  return endpoint.description.split("\n", 1)[0]?.trim() ?? "";
}

/**
 * One diff endpoint: its summary line (skipped when it just repeats the
 * view label) plus the prefix-highlighted change id.
 */
function Endpoint({
  endpoint,
  specLabel,
}: {
  endpoint: DiffEndpoint;
  specLabel?: string;
}) {
  const summary = summaryOf(endpoint);
  return (
    <span className="endpoint">
      {summary && summary !== specLabel && (
        <span className="endpoint-summary">{summary} </span>
      )}
      <ChangeId id={endpoint.changeId} prefix={endpoint.changeIdPrefix} />
    </span>
  );
}

function DiffEndpoints({
  diff,
  specLabel,
}: {
  diff: DiffResponse;
  specLabel: string;
}) {
  if (diff.change) {
    return (
      <span className="endpoints">
        <Endpoint endpoint={diff.change} specLabel={specLabel} />
      </span>
    );
  }
  if (diff.from && diff.to) {
    return (
      <span className="endpoints">
        <Endpoint endpoint={diff.from} specLabel={specLabel} />
        {" → "}
        <Endpoint endpoint={diff.to} specLabel={specLabel} />
      </span>
    );
  }
  return null;
}

function fileStats(files: FileDiffMetadata[]): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
  }
  return { additions, deletions };
}

function FileDiffCard({
  file,
  diffStyle,
  comments,
  draft,
  onOpenDraft,
  onCloseDraft,
  onSaveDraft,
  onCommentsChanged,
  registerRef,
  openMenu,
}: {
  file: FileDiffMetadata;
  diffStyle: "unified" | "split";
  comments: Comment[];
  draft: Draft | null;
  onOpenDraft: (draft: Draft) => void;
  onCloseDraft: () => void;
  onSaveDraft: (text: string) => Promise<void>;
  onCommentsChanged: () => Promise<void>;
  registerRef: (el: HTMLDivElement | null) => void;
  openMenu: OpenMenu;
}) {
  const annotations = useMemo(() => {
    const result: DiffLineAnnotation<AnnoMeta>[] = [];
    const grouped = new Map<string, Comment[]>();
    for (const c of comments) {
      const key = `${c.side}:${c.line}`;
      grouped.set(key, [...(grouped.get(key) ?? []), c]);
    }
    for (const group of grouped.values()) {
      const first = group[0]!;
      // A draft on a line that already has a thread renders inside the
      // thread instead of as a second annotation.
      result.push({
        side: first.side,
        lineNumber: first.line,
        metadata: { kind: "thread", comments: group },
      });
    }
    if (
      draft &&
      !grouped.has(`${draft.side}:${draft.line}`)
    ) {
      result.push({
        side: draft.side,
        lineNumber: draft.line,
        metadata: { kind: "draft" },
      });
    }
    return result;
  }, [comments, draft]);

  const fileName = file.name;
  const options = useMemo(
    () => ({
      theme: { dark: "github-dark" as const, light: "github-light" as const },
      themeType: "dark" as const,
      diffStyle,
      lineHoverHighlight: "number" as const,
      onLineNumberClick: ({
        lineNumber,
        annotationSide,
        lineElement,
      }: {
        lineNumber: number;
        annotationSide: CommentSide;
        lineElement: HTMLElement;
      }) => {
        onOpenDraft({
          file: fileName,
          side: annotationSide,
          line: lineNumber,
          codeLine: lineElement.textContent ?? null,
        });
      },
    }),
    [fileName, diffStyle, onOpenDraft],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnoMeta>) => {
      const meta = annotation.metadata;
      if (!meta) return null;
      const lineDraft =
        draft &&
        draft.side === annotation.side &&
        draft.line === annotation.lineNumber
          ? draft
          : null;
      return (
        <CommentThread
          comments={meta.kind === "thread" ? meta.comments : []}
          hasDraft={meta.kind === "draft" || lineDraft !== null}
          onSave={onSaveDraft}
          onCancel={onCloseDraft}
          onChanged={onCommentsChanged}
        />
      );
    },
    [draft, onSaveDraft, onCloseDraft, onCommentsChanged],
  );

  return (
    <div
      className="file-card"
      ref={registerRef}
      data-file={file.name}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: "copy file path", value: file.name },
          ...(file.prevName
            ? [{ label: "copy old file path", value: file.prevName }]
            : []),
        ])
      }
    >
      <FileDiff<AnnoMeta>
        fileDiff={file}
        options={options}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        disableWorkerPool
      />
    </div>
  );
}

function CommentThread({
  comments,
  hasDraft,
  onSave,
  onCancel,
  onChanged,
}: {
  comments: Comment[];
  hasDraft: boolean;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="comment-thread">
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} onChanged={onChanged} />
      ))}
      {hasDraft && <CommentEditor onSave={onSave} onCancel={onCancel} />}
    </div>
  );
}

function CommentCard({
  comment,
  onChanged,
}: {
  comment: Comment;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);

  if (editing) {
    return (
      <div className="comment-card">
        <textarea
          className="comment-input"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              void updateComment(comment.id, text).then(() => {
                setEditing(false);
                return onChanged();
              });
            }
            if (e.key === "Escape") {
              setText(comment.text);
              setEditing(false);
            }
          }}
        />
        <div className="comment-actions">
          <button
            className="primary"
            disabled={text.trim().length === 0}
            onClick={() =>
              void updateComment(comment.id, text).then(() => {
                setEditing(false);
                return onChanged();
              })
            }
          >
            save
          </button>
          <button
            className="ghost"
            onClick={() => {
              setText(comment.text);
              setEditing(false);
            }}
          >
            cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="comment-card">
      <div className="comment-text">{comment.text}</div>
      <div className="comment-actions">
        <button className="ghost" onClick={() => setEditing(true)}>
          edit
        </button>
        <button
          className="ghost danger"
          onClick={() => void deleteComment(comment.id).then(onChanged)}
        >
          delete
        </button>
      </div>
    </div>
  );
}

function CommentEditor({
  onSave,
  onCancel,
}: {
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (text.trim().length === 0) return;
    setSaving(true);
    try {
      await onSave(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="comment-card">
      <textarea
        className="comment-input"
        placeholder="Leave feedback for your agent… (⌘⏎ to save)"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="comment-actions">
        <button
          className="primary"
          disabled={saving || text.trim().length === 0}
          onClick={() => void save()}
        >
          comment
        </button>
        <button className="ghost" onClick={onCancel}>
          cancel
        </button>
      </div>
    </div>
  );
}
