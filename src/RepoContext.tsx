import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  ActionRequest,
  Comment,
  DiffResponse,
  RepoInfo,
  StackView,
} from "../lib/schema";
import { type DiffSpec } from "./api";
import { useRepoData } from "./useRepoData";

interface RepoState {
  repo: RepoInfo | null;
  stack: StackView | null;
  spec: DiffSpec;
  diff: DiffResponse | null;
  diffError: string | null;
  actionError: string | null;
  comments: Comment[];
  loading: boolean;
}

interface RepoActions {
  setSpec: (spec: DiffSpec) => void;
  setActionError: (message: string | null) => void;
  reloadComments: () => Promise<void>;
  setEditing: (editing: boolean) => void;
  handleRefresh: () => Promise<void>;
  runRepoAction: (
    request: ActionRequest,
    opts?: { viewWorkingCopy?: boolean },
  ) => Promise<void>;
  loadStack: (snapshot: boolean) => Promise<void>;
  loadDiff: (target: DiffSpec) => Promise<void>;
}

interface RepoMeta {
  editingRef: RefObject<boolean>;
}

interface RepoContextValue {
  state: RepoState;
  actions: RepoActions;
  meta: RepoMeta;
}

const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ children }: { children: ReactNode }) {
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    repo,
    stack,
    spec,
    setSpec,
    diff,
    diffError,
    comments,
    loading,
    editingRef,
    setEditing,
    reloadComments,
    handleRefresh,
    runRepoAction,
    loadStack,
    loadDiff,
  } = useRepoData({ onActionError: setActionError });

  const state = useMemo(
    (): RepoState => ({
      repo,
      stack,
      spec,
      diff,
      diffError,
      actionError,
      comments,
      loading,
    }),
    [repo, stack, spec, diff, diffError, actionError, comments, loading],
  );

  const actions = useMemo(
    (): RepoActions => ({
      setSpec,
      setActionError,
      reloadComments,
      setEditing,
      handleRefresh,
      runRepoAction,
      loadStack,
      loadDiff,
    }),
    [
      setSpec,
      reloadComments,
      setEditing,
      handleRefresh,
      runRepoAction,
      loadStack,
      loadDiff,
    ],
  );

  const meta = useMemo((): RepoMeta => ({ editingRef }), [editingRef]);

  return (
    <RepoContext value={{ state, actions, meta }}>{children}</RepoContext>
  );
}

export function useRepo(): RepoContextValue {
  const ctx = use(RepoContext);
  if (!ctx) {
    throw new Error("useRepo must be used within RepoProvider");
  }
  return ctx;
}

interface HelpContextValue {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  openHelp: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const value = useMemo(
    (): HelpContextValue => ({ helpOpen, setHelpOpen, openHelp }),
    [helpOpen, openHelp],
  );
  return <HelpContext value={value}>{children}</HelpContext>;
}

export function useHelp(): HelpContextValue {
  const ctx = use(HelpContext);
  if (!ctx) {
    throw new Error("useHelp must be used within HelpProvider");
  }
  return ctx;
}
