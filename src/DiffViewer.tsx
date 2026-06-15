import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  parsePatchFiles,
  type FileDiffMetadata,
  type SelectedLineRange,
} from "@pierre/diffs";
import {
  FileDiff,
  Virtualizer,
  type DiffLineAnnotation,
} from "@pierre/diffs/react";
import type {
  Comment,
  CommentSide,
  DiffEndpoint,
  DiffResponse,
} from "../lib/schema";
import { ChangeId } from "./ChangeId";
import { ContextMenu, copyItem } from "./ContextMenu";
import {
  addComment,
  clearComments,
  deleteComment,
  exportFeedback,
  runAction,
  updateComment,
  type DiffSpec,
} from "./api";
import { FileTreePanel } from "./FileTreePanel";
import { TextAreaEditor } from "./TextAreaEditor";

type AnnoMeta =
  | { kind: "thread"; comments: Comment[] }
  | { kind: "draft" };

interface Draft {
  file: string;
  side: CommentSide;
  line: number;
  /** Inclusive range end; set only when the draft spans multiple lines. */
  endLine?: number;
  codeLine: string | null;
}

/** Target of the inline header describe editor. */
interface DescribeTarget {
  changeId: string;
  /** Full current description, prefilled into the editor. */
  description: string;
}

/**
 * Source text for a display line number (1-based, per side), resolved through
 * the hunk that contains it: hunk `*Start`/`*Count` give the display range and
 * `*LineIndex` points at the matching slot in the file's `additionLines` /
 * `deletionLines`. Null for lines outside every hunk (collapsed context).
 */
function lineTextFor(
  file: FileDiffMetadata,
  side: CommentSide,
  line: number,
): string | null {
  const adds = side === "additions";
  for (const hunk of file.hunks) {
    const start = adds ? hunk.additionStart : hunk.deletionStart;
    const count = adds ? hunk.additionCount : hunk.deletionCount;
    if (line < start || line >= start + count) continue;
    const index = adds ? hunk.additionLineIndex : hunk.deletionLineIndex;
    const text = (adds ? file.additionLines : file.deletionLines)[
      index + (line - start)
    ];
    // Parsed lines keep their terminator; drop it so snippets join cleanly.
    return text?.replace(/\r?\n$/, "") ?? null;
  }
  return null;
}

/** Cap range snippets so exports stay readable for big drags. */
const SNIPPET_MAX_LINES = 8;

/**
 * Code context for a comment spanning display lines lo..hi (inclusive):
 * newline-joined, capped at {@link SNIPPET_MAX_LINES} with a trailing "…"
 * line when truncated. Lines missing from the patch render as "…".
 */
function snippetFor(
  file: FileDiffMetadata,
  side: CommentSide,
  lo: number,
  hi: number,
): string | null {
  if (hi <= lo) return lineTextFor(file, side, lo);
  const cap = Math.min(hi, lo + SNIPPET_MAX_LINES - 1);
  const lines: string[] = [];
  for (let n = lo; n <= cap; n++) {
    lines.push(lineTextFor(file, side, n) ?? "…");
  }
  if (cap < hi) lines.push("…");
  return lines.join("\n");
}

export function DiffViewer({
  spec,
  diff,
  comments,
  allCommentCount,
  pendingDescribe,
  onPendingDescribeHandled,
  onCommentsChanged,
  onEditingChanged,
}: {
  spec: DiffSpec;
  diff: DiffResponse;
  /** Comments scoped to this spec. */
  comments: Comment[];
  allCommentCount: number;
  /** Open the describe editor once this change's diff is shown (command palette). */
  pendingDescribe?: DescribeTarget | null;
  onPendingDescribeHandled?: () => void;
  onCommentsChanged: () => Promise<void>;
  onEditingChanged: (editing: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [describing, setDescribing] = useState<DescribeTarget | null>(null);
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [treeOpen, setTreeOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const fileRefs = useRef(new Map<string, HTMLDivElement>());

  const files = useMemo(
    () => parsePatchFiles(diff.patch).flatMap((p) => p.files),
    [diff.patch],
  );

  // Pierre's VirtualizedFileDiff only adopts a fileDiff on mount, so a card
  // keyed by file name alone keeps rendering whatever patch it first showed.
  // Commit shas pin exact content (change ids don't — they survive amends),
  // so keying on the endpoint shas remounts cards exactly when needed.
  const diffKey = diff.change
    ? diff.change.commitId
    : `${diff.from?.commitId}..${diff.to?.commitId}`;

  // Close any open editor when switching views.
  useEffect(() => {
    setDraft(null);
    setDescribing(null);
  }, [spec.key]);

  useEffect(() => {
    if (!pendingDescribe || diff.change?.changeId !== pendingDescribe.changeId) {
      return;
    }
    setDescribing(pendingDescribe);
    onPendingDescribeHandled?.();
  }, [pendingDescribe, diff.change?.changeId, onPendingDescribeHandled]);

  // Either open editor defers diff refetches (see App.setEditing).
  useEffect(() => {
    onEditingChanged(draft !== null || describing !== null);
  }, [draft, describing, onEditingChanged]);

  const openDraft = useCallback((d: Draft) => setDraft(d), []);
  const closeDraft = useCallback(() => setDraft(null), []);

  const saveDraft = useCallback(
    async (text: string) => {
      if (!draft) return;
      await addComment({
        specKey: spec.key,
        specLabel: spec.label,
        file: draft.file,
        side: draft.side,
        line: draft.line,
        endLine: draft.endLine,
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
          {describing ? (
            <DescribeEditor
              key={describing.changeId}
              target={describing}
              onClose={() => setDescribing(null)}
            />
          ) : (
            <>
              {/* In change mode the endpoint summary is suppressed when it
                  repeats the label, so the label itself is the edit target. */}
              {diff.change && !diff.change.immutable ? (
                <span
                  className="diff-label describable"
                  title="double-click to edit description"
                  onDoubleClick={() => {
                    const c = diff.change!;
                    setDescribing({
                      changeId: c.changeId,
                      description: c.description,
                    });
                  }}
                >
                  {spec.label}
                </span>
              ) : (
                <span className="diff-label" title={spec.label}>
                  {spec.label}
                </span>
              )}
              <DiffEndpoints
                diff={diff}
                specLabel={spec.label}
                onDescribe={setDescribing}
              />
            </>
          )}
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
          <Virtualizer
            className="diff-files"
            contentClassName="diff-files-content"
          >
            {files.map((file) => (
              <FileDiffCard
                key={`${diffKey}:${file.name}`}
                file={file}
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
          </Virtualizer>
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
function ImmutableEndpoint({
  endpoint,
  specLabel,
}: {
  endpoint: DiffEndpoint;
  specLabel?: string;
}) {
  const summary = summaryOf(endpoint);
  return (
    <span className="endpoint">
      {summary ? (
        summary !== specLabel && (
          <span className="endpoint-summary">{summary} </span>
        )
      ) : (
        <span className="endpoint-summary placeholder">(no description) </span>
      )}
      <ChangeId id={endpoint.changeId} prefix={endpoint.changeIdPrefix} />
    </span>
  );
}

function DescribableEndpoint({
  endpoint,
  specLabel,
  onDescribe,
}: {
  endpoint: DiffEndpoint;
  specLabel?: string;
  onDescribe: (target: DescribeTarget) => void;
}) {
  const summary = summaryOf(endpoint);
  const editProps = {
    title: "double-click to edit description",
    onDoubleClick: () =>
      onDescribe({
        changeId: endpoint.changeId,
        description: endpoint.description,
      }),
  };
  return (
    <span className="endpoint">
      {summary ? (
        summary !== specLabel && (
          <span className="endpoint-summary describable" {...editProps}>
            {summary}{" "}
          </span>
        )
      ) : (
        <span
          className="endpoint-summary placeholder describable"
          {...editProps}
        >
          (no description){" "}
        </span>
      )}
      <ChangeId id={endpoint.changeId} prefix={endpoint.changeIdPrefix} />
    </span>
  );
}

function Endpoint({
  endpoint,
  specLabel,
  onDescribe,
}: {
  endpoint: DiffEndpoint;
  specLabel?: string;
  onDescribe: (target: DescribeTarget) => void;
}) {
  if (endpoint.immutable) {
    return <ImmutableEndpoint endpoint={endpoint} specLabel={specLabel} />;
  }
  return (
    <DescribableEndpoint
      endpoint={endpoint}
      specLabel={specLabel}
      onDescribe={onDescribe}
    />
  );
}

function DiffEndpoints({
  diff,
  specLabel,
  onDescribe,
}: {
  diff: DiffResponse;
  specLabel: string;
  onDescribe: (target: DescribeTarget) => void;
}) {
  if (diff.change) {
    return (
      <span className="endpoints">
        <Endpoint
          endpoint={diff.change}
          specLabel={specLabel}
          onDescribe={onDescribe}
        />
      </span>
    );
  }
  if (diff.from && diff.to) {
    return (
      <span className="endpoints">
        <Endpoint
          endpoint={diff.from}
          specLabel={specLabel}
          onDescribe={onDescribe}
        />
        {" → "}
        <Endpoint
          endpoint={diff.to}
          specLabel={specLabel}
          onDescribe={onDescribe}
        />
      </span>
    );
  }
  return null;
}

function DescribeEditor({
  target,
  onClose,
}: {
  target: DescribeTarget;
  onClose: () => void;
}) {
  const [text, setText] = useState(target.description);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await runAction({
        action: "describe",
        changeId: target.changeId,
        message: text,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <TextAreaEditor
      value={text}
      onChange={setText}
      onSave={save}
      onCancel={onClose}
      placeholder="Describe this change… (⌘⏎ to save)"
      saveLabel="save"
      saving={saving}
      wrapperClassName="describe-editor"
    />
  );
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
}) {
  const annotations = useMemo(() => {
    const result: DiffLineAnnotation<AnnoMeta>[] = [];
    // Range comments anchor at their END line (annotations render below
    // their line, so the thread sits under the whole range).
    const grouped = new Map<string, Comment[]>();
    for (const c of comments) {
      const key = `${c.side}:${c.endLine ?? c.line}`;
      grouped.set(key, [...(grouped.get(key) ?? []), c]);
    }
    for (const group of grouped.values()) {
      const first = group[0]!;
      // A draft on a line that already has a thread renders inside the
      // thread instead of as a second annotation.
      result.push({
        side: first.side,
        lineNumber: first.endLine ?? first.line,
        metadata: { kind: "thread", comments: group },
      });
    }
    if (
      draft &&
      !grouped.has(`${draft.side}:${draft.endLine ?? draft.line}`)
    ) {
      result.push({
        side: draft.side,
        lineNumber: draft.endLine ?? draft.line,
        metadata: { kind: "draft" },
      });
    }
    return result;
  }, [comments, draft]);

  const fileName = file.name;
  const options = useMemo(
    () => ({
      theme: { dark: "one-dark-pro" as const, light: "min-light" as const },
      themeType: "system" as const,
      diffStyle,
      lineHoverHighlight: "number" as const,
      enableLineSelection: true,
      enableGutterUtility: true,
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
          codeLine:
            lineTextFor(file, annotationSide, lineNumber) ??
            lineElement.textContent ??
            null,
        });
      },
      onGutterUtilityClick: (range: SelectedLineRange) => {
        // `start` is the drag anchor and may sit below `end`.
        let lo = Math.min(range.start, range.end);
        let hi = Math.max(range.start, range.end);
        let side: CommentSide = range.side ?? "additions";
        // A split-view drag across columns has no coherent line range;
        // degrade to a single-line comment where the drag ended.
        if (range.side && range.endSide && range.side !== range.endSide) {
          side = range.endSide;
          lo = hi = range.end;
        }
        onOpenDraft({
          file: fileName,
          side,
          line: lo,
          endLine: hi > lo ? hi : undefined,
          codeLine: snippetFor(file, side, lo, hi),
        });
      },
    }),
    [file, fileName, diffStyle, onOpenDraft],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnoMeta>) => {
      const meta = annotation.metadata;
      if (!meta) return null;
      const lineDraft =
        draft &&
        draft.side === annotation.side &&
        (draft.endLine ?? draft.line) === annotation.lineNumber
          ? draft
          : null;
      return (
        <CommentThread
          comments={meta.kind === "thread" ? meta.comments : []}
          draftEditor={
            meta.kind === "draft" || lineDraft !== null ? (
              <CommentDraftEditor onSave={onSaveDraft} onCancel={onCloseDraft} />
            ) : undefined
          }
          onChanged={onCommentsChanged}
        />
      );
    },
    [draft, onSaveDraft, onCloseDraft, onCommentsChanged],
  );

  return (
    <ContextMenu
      items={[
        copyItem("copy file path", file.name),
        ...(file.prevName
          ? [copyItem("copy old file path", file.prevName)]
          : []),
      ]}
    >
      <div
        className="file-card"
        ref={registerRef}
        data-file={file.name}
      >
        <FileDiff<AnnoMeta>
          fileDiff={file}
          options={options}
          lineAnnotations={annotations}
          renderAnnotation={renderAnnotation}
          disableWorkerPool
        />
      </div>
    </ContextMenu>
  );
}

function CommentThread({
  comments,
  draftEditor,
  onChanged,
}: {
  comments: Comment[];
  draftEditor?: ReactNode;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="comment-thread">
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} onChanged={onChanged} />
      ))}
      {draftEditor}
    </div>
  );
}

function CommentDisplay({
  comment,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="comment-card">
      {comment.endLine && (
        <span className="range-chip">
          lines {comment.line}–{comment.endLine}
        </span>
      )}
      <div className="comment-text">{comment.text}</div>
      <div className="comment-actions">
        <button className="ghost" onClick={onEdit}>
          edit
        </button>
        <button className="ghost danger" onClick={onDelete}>
          delete
        </button>
      </div>
    </div>
  );
}

function CommentCardEditor({
  comment,
  onSaved,
  onCancel,
}: {
  comment: Comment;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(comment.text);

  const save = async () => {
    await updateComment(comment.id, text);
    await onSaved();
  };

  return (
    <TextAreaEditor
      value={text}
      onChange={setText}
      onSave={save}
      onCancel={() => {
        setText(comment.text);
        onCancel();
      }}
      placeholder=""
      saveLabel="save"
    />
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

  if (editing) {
    return (
      <CommentCardEditor
        comment={comment}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <CommentDisplay
      comment={comment}
      onEdit={() => setEditing(true)}
      onDelete={() => void deleteComment(comment.id).then(onChanged)}
    />
  );
}

function CommentDraftEditor({
  onSave,
  onCancel,
}: {
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <TextAreaEditor
      value={text}
      onChange={setText}
      onSave={save}
      onCancel={onCancel}
      placeholder="Leave feedback for your agent… (⌘⏎ to save)"
      saveLabel="comment"
      saving={saving}
    />
  );
}

