import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import type { Comment, CommentSide, DiffResponse } from "../lib/schema";
import {
  addComment,
  clearComments,
  exportFeedback,
  type DiffSpec,
} from "./api";

export interface Draft {
  file: string;
  side: CommentSide;
  line: number;
  endLine?: number;
  codeLine: string | null;
}

export interface DescribeTarget {
  changeId: string;
  description: string;
}

interface DiffViewerState {
  spec: DiffSpec;
  diff: DiffResponse;
  comments: Comment[];
  allCommentCount: number;
  draft: Draft | null;
  describing: DescribeTarget | null;
  diffStyle: "unified" | "split";
  treeOpen: boolean;
  copied: boolean;
  files: FileDiffMetadata[];
  diffKey: string;
  stats: { additions: number; deletions: number };
}

interface DiffViewerActions {
  setDescribing: (target: DescribeTarget | null) => void;
  openDraft: (draft: Draft) => void;
  closeDraft: () => void;
  saveDraft: (text: string) => Promise<void>;
  toggleTree: () => void;
  toggleDiffStyle: () => void;
  copyFeedback: () => Promise<void>;
  clearComments: () => Promise<void>;
  scrollToFile: (name: string) => void;
  registerFileRef: (name: string, el: HTMLDivElement | null) => void;
  onCommentsChanged: () => Promise<void>;
}

interface DiffViewerMeta {
  fileRefs: RefObject<Map<string, HTMLDivElement>>;
}

interface DiffViewerContextValue {
  state: DiffViewerState;
  actions: DiffViewerActions;
  meta: DiffViewerMeta;
}

const DiffViewerContext = createContext<DiffViewerContextValue | null>(null);

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

export function DiffViewerProvider({
  spec,
  diff,
  comments,
  allCommentCount,
  pendingDescribe,
  onPendingDescribeHandled,
  onCommentsChanged,
  onEditingChanged,
  children,
}: {
  spec: DiffSpec;
  diff: DiffResponse;
  comments: Comment[];
  allCommentCount: number;
  pendingDescribe?: DescribeTarget | null;
  onPendingDescribeHandled?: () => void;
  onCommentsChanged: () => Promise<void>;
  onEditingChanged: (editing: boolean) => void;
  children: ReactNode;
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

  const diffKey = diff.change
    ? diff.change.commitId
    : `${diff.from?.commitId}..${diff.to?.commitId}`;

  const stats = useMemo(() => fileStats(files), [files]);

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

  const copyFeedback = useCallback(async () => {
    const { markdown } = await exportFeedback();
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const clearAllComments = useCallback(async () => {
    if (!confirm("Delete all review comments?")) return;
    await clearComments();
    await onCommentsChanged();
  }, [onCommentsChanged]);

  const scrollToFile = useCallback((name: string) => {
    fileRefs.current.get(name)?.scrollIntoView({ block: "start" });
  }, []);

  const registerFileRef = useCallback(
    (name: string, el: HTMLDivElement | null) => {
      if (el) fileRefs.current.set(name, el);
      else fileRefs.current.delete(name);
    },
    [],
  );

  const toggleTree = useCallback(() => setTreeOpen((open) => !open), []);
  const toggleDiffStyle = useCallback(
    () => setDiffStyle((s) => (s === "unified" ? "split" : "unified")),
    [],
  );

  const state = useMemo(
    (): DiffViewerState => ({
      spec,
      diff,
      comments,
      allCommentCount,
      draft,
      describing,
      diffStyle,
      treeOpen,
      copied,
      files,
      diffKey,
      stats,
    }),
    [
      spec,
      diff,
      comments,
      allCommentCount,
      draft,
      describing,
      diffStyle,
      treeOpen,
      copied,
      files,
      diffKey,
      stats,
    ],
  );

  const actions = useMemo(
    (): DiffViewerActions => ({
      setDescribing,
      openDraft,
      closeDraft,
      saveDraft,
      toggleTree,
      toggleDiffStyle,
      copyFeedback,
      clearComments: clearAllComments,
      scrollToFile,
      registerFileRef,
      onCommentsChanged,
    }),
    [
      openDraft,
      closeDraft,
      saveDraft,
      toggleTree,
      toggleDiffStyle,
      copyFeedback,
      clearAllComments,
      scrollToFile,
      registerFileRef,
      onCommentsChanged,
    ],
  );

  const meta = useMemo((): DiffViewerMeta => ({ fileRefs }), [fileRefs]);

  return (
    <DiffViewerContext value={{ state, actions, meta }}>
      {children}
    </DiffViewerContext>
  );
}

export function useDiffViewer(): DiffViewerContextValue {
  const ctx = use(DiffViewerContext);
  if (!ctx) {
    throw new Error("useDiffViewer must be used within DiffViewerProvider");
  }
  return ctx;
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="diff-viewer">{children}</div>;
}

export const DiffViewerCompound = {
  Provider: DiffViewerProvider,
  Frame,
};
