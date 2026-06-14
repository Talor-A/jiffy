import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionRequest,
  Comment,
  DiffResponse,
  RepoInfo,
  StackView,
} from "../lib/schema";
import {
  getDiff,
  getRepo,
  getStack,
  listComments,
  onRepoChanged,
  refreshRepo,
  runAction,
  WC_SPEC,
  type DiffSpec,
} from "./api";

export function useRepoData({
  onActionError,
}: {
  onActionError: (message: string | null) => void;
}) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [stack, setStack] = useState<StackView | null>(null);
  const [spec, setSpec] = useState<DiffSpec>(WC_SPEC);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

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
    async (
      request: ActionRequest,
      opts: { viewWorkingCopy?: boolean } = {},
    ) => {
      onActionError(null);
      try {
        await runAction(request);
        await loadStack(false);
        const target = opts.viewWorkingCopy ? WC_SPEC : spec;
        if (opts.viewWorkingCopy) setSpec(WC_SPEC);
        await loadDiff(target);
      } catch (e) {
        onActionError((e as Error).message);
      }
    },
    [loadStack, loadDiff, onActionError, spec],
  );

  return {
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
  };
}
