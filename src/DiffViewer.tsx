import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
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
  deleteComment,
  runAction,
  updateComment,
  type DiffSpec,
} from "./api";
import { FileTreePanel } from "./FileTreePanel";
import { TextAreaEditor } from "./TextAreaEditor";
import {
  DiffViewerCompound,
  useDiffViewer,
  type DescribeTarget,
  type Draft,
} from "./DiffViewerContext";

type AnnoMeta =
  | { kind: "thread"; comments: Comment[] }
  | { kind: "draft" };

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
  comments: Comment[];
  allCommentCount: number;
  pendingDescribe?: DescribeTarget | null;
  onPendingDescribeHandled?: () => void;
  onCommentsChanged: () => Promise<void>;
  onEditingChanged: (editing: boolean) => void;
}) {
  return (
    <DiffViewerCompound.Provider
      spec={spec}
      diff={diff}
      comments={comments}
      allCommentCount={allCommentCount}
      pendingDescribe={pendingDescribe}
      onPendingDescribeHandled={onPendingDescribeHandled}
      onCommentsChanged={onCommentsChanged}
      onEditingChanged={onEditingChanged}
    >
      <DiffViewerCompound.Frame>
        <DiffViewerHeader />
        <DiffViewerBody />
      </DiffViewerCompound.Frame>
    </DiffViewerCompound.Provider>
  );
}

export const DiffViewerParts = {
  ...DiffViewerCompound,
  Header: DiffViewerHeader,
  Title: DiffViewerTitle,
  Toolbar: DiffViewerToolbar,
  Body: DiffViewerBody,
};

function DiffViewerHeader() {
  return (
    <header className="diff-header">
      <DiffViewerTitle />
      <DiffViewerToolbar />
    </header>
  );
}

function DiffViewerTitle() {
  const { state, actions } = useDiffViewer();
  const { spec, diff, describing } = state;
  const { setDescribing } = actions;

  if (describing) {
    return (
      <div className="diff-title">
        <DescribeEditor
          key={describing.changeId}
          target={describing}
          onClose={() => setDescribing(null)}
        />
      </div>
    );
  }

  return (
    <div className="diff-title">
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
    </div>
  );
}

function DiffViewerToolbar() {
  const { state, actions } = useDiffViewer();
  const {
    files,
    stats,
    treeOpen,
    diffStyle,
    copied,
    allCommentCount,
  } = state;
  const { toggleTree, toggleDiffStyle, copyFeedback, clearComments } = actions;

  return (
    <div className="diff-meta">
      <span className="stat">
        {files.length} file{files.length === 1 ? "" : "s"}
      </span>
      <span className="stat additions">+{stats.additions}</span>
      <span className="stat deletions">−{stats.deletions}</span>
      <button
        className="ghost"
        onClick={toggleTree}
        title={treeOpen ? "hide the file tree" : "show the file tree"}
      >
        {treeOpen ? "⊟ files" : "⊞ files"}
      </button>
      <button className="ghost" onClick={toggleDiffStyle}>
        {diffStyle === "unified" ? "split view" : "unified view"}
      </button>
      <button
        className="primary"
        disabled={allCommentCount === 0}
        onClick={() => void copyFeedback()}
        title="Copy all comments as agent-ready markdown"
      >
        {copied ? "copied ✓" : `copy feedback (${allCommentCount})`}
      </button>
      {allCommentCount > 0 && (
        <button className="ghost danger" onClick={() => void clearComments()}>
          clear
        </button>
      )}
    </div>
  );
}

function DiffViewerBody() {
  const { state, actions } = useDiffViewer();
  const { files, treeOpen, diffKey, diffStyle, draft, comments } = state;
  const {
    scrollToFile,
    openDraft,
    closeDraft,
    saveDraft,
    registerFileRef,
    onCommentsChanged,
  } = actions;

  if (files.length === 0) {
    return <div className="placeholder">no changes in this view</div>;
  }

  return (
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
            registerRef={(el) => registerFileRef(file.name, el)}
          />
        ))}
      </Virtualizer>
    </div>
  );
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

