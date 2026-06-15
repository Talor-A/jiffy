import { useCallback, useMemo, useState } from "react";
import type { ActionRequest, ChangeInfo, StackView } from "../lib/schema";
import { changeSpec, runAction, WC_SPEC, type DiffSpec } from "./api";
import { flattenStackBookmarks } from "./BookmarkPicker";
import { flattenStackChanges } from "./CommitPicker";
import {
  bookmarkMoveDestinationConfig,
  changeLabel,
  squashIntoConfig,
  STACK_ACTION_CONFIG,
  stackActionRequest,
  type ActivePicker,
  type PickerActionKind,
} from "./stackPicker";

export function useStackPicker({
  stack,
  setSpec,
  loadStack,
  loadDiff,
  onActionError,
}: {
  stack: StackView | null;
  setSpec: (spec: DiffSpec) => void;
  loadStack: (snapshot: boolean) => Promise<void>;
  loadDiff: (target: DiffSpec) => Promise<void>;
  onActionError: (message: string | null) => void;
}) {
  const [stackAction, setStackAction] = useState<PickerActionKind | null>(null);
  const [squashSource, setSquashSource] = useState<ChangeInfo | null>(null);
  const [bookmarkMoveTarget, setBookmarkMoveTarget] = useState<string | null>(
    null,
  );
  const [pendingDescribe, setPendingDescribe] = useState<{
    changeId: string;
    description: string;
  } | null>(null);

  const pickableChanges = useMemo(() => flattenStackChanges(stack), [stack]);
  const pickableBookmarks = useMemo(
    () => flattenStackBookmarks(stack),
    [stack],
  );

  const closePicker = useCallback(() => {
    setStackAction(null);
    setSquashSource(null);
    setBookmarkMoveTarget(null);
  }, []);

  const runStackAction = useCallback(
    async (request: ActionRequest, confirmation: string) => {
      const confirmed = window.confirm(
        `${confirmation}\n\n` +
          "This rewrites jj history. Use `jj op restore` if you need to undo it.",
      );
      if (!confirmed) return;

      onActionError(null);
      try {
        await runAction(request);
        await loadStack(false);
        setSpec(WC_SPEC);
        await loadDiff(WC_SPEC);
      } catch (e) {
        onActionError((e as Error).message);
      }
    },
    [loadStack, loadDiff, onActionError, setSpec],
  );

  const handlePick = useCallback(
    (change: ChangeInfo) => {
      if (!stackAction) return;
      if (stackAction === "describe") {
        closePicker();
        setSpec(changeSpec(change));
        setPendingDescribe({
          changeId: change.changeId,
          description: change.description,
        });
        return;
      }
      if (stackAction === "squash") {
        if (!squashSource) {
          setSquashSource(change);
          return;
        }
        closePicker();
        void runStackAction(
          {
            action: "squash",
            fromChangeId: squashSource.changeId,
            intoChangeId: change.changeId,
            useDestinationMessage: true,
          },
          `Squash ${changeLabel(squashSource)} into ${changeLabel(change)}?`,
        );
        return;
      }
      if (stackAction === "bookmark-move" && bookmarkMoveTarget) {
        closePicker();
        void runStackAction(
          {
            action: "bookmark-move",
            bookmarkName: bookmarkMoveTarget,
            toChangeId: change.changeId,
          },
          `Move bookmark ${bookmarkMoveTarget} to ${changeLabel(change)}?`,
        );
        return;
      }
      closePicker();
      if (stackAction !== "abandon" && stackAction !== "absorb") return;
      void runStackAction(
        stackActionRequest(stackAction, change),
        `${STACK_ACTION_CONFIG[stackAction].confirmVerb} ${changeLabel(change)}?`,
      );
    },
    [
      stackAction,
      squashSource,
      bookmarkMoveTarget,
      closePicker,
      runStackAction,
      setSpec,
    ],
  );

  const getPickerDisabledReason = useCallback(
    (change: ChangeInfo): string | null => {
      if (change.immutable) return "immutable";
      if (squashSource && change.changeId === squashSource.changeId) {
        return "source";
      }
      return null;
    },
    [squashSource],
  );

  const activePicker = useMemo((): ActivePicker | null => {
    if (!stackAction) return null;
    if (stackAction === "bookmark-move") {
      if (!bookmarkMoveTarget) return { kind: "bookmark-select" };
      return {
        kind: "bookmark-destination",
        bookmark: bookmarkMoveTarget,
        config: bookmarkMoveDestinationConfig(bookmarkMoveTarget),
      };
    }
    if (stackAction === "squash") {
      if (!squashSource) {
        return { kind: "squash-source", config: STACK_ACTION_CONFIG.squash };
      }
      return {
        kind: "squash-destination",
        source: squashSource,
        config: squashIntoConfig(squashSource),
      };
    }
    return {
      kind: "single-change",
      action: stackAction,
      config: STACK_ACTION_CONFIG[stackAction],
    };
  }, [stackAction, bookmarkMoveTarget, squashSource]);

  return {
    stackAction,
    setStackAction,
    pendingDescribe,
    clearPendingDescribe: () => setPendingDescribe(null),
    pickableChanges,
    pickableBookmarks,
    activePicker,
    closePicker,
    handlePick,
    getPickerDisabledReason,
    setBookmarkMoveTarget,
  };
}
