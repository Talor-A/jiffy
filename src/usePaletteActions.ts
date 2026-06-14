import { useMemo } from "react";
import type { ActionRequest, RepoInfo, StackView } from "../lib/schema";
import { WC_SPEC, type DiffSpec } from "./api";
import type { PaletteAction } from "./CommandPalette";
import type { PickerActionKind } from "./stackPicker";

export function usePaletteActions({
  repo,
  stack,
  pickableChangesCount,
  pickableBookmarksCount,
  setSpec,
  setHelpOpen,
  setStackAction,
  runRepoAction,
  handleRefresh,
}: {
  repo: RepoInfo | null;
  stack: StackView | null;
  pickableChangesCount: number;
  pickableBookmarksCount: number;
  setSpec: (spec: DiffSpec) => void;
  setHelpOpen: (open: boolean) => void;
  setStackAction: (action: PickerActionKind | null) => void;
  runRepoAction: (
    request: ActionRequest,
    opts?: { viewWorkingCopy?: boolean },
  ) => Promise<void>;
  handleRefresh: () => Promise<void>;
}): PaletteAction[] {
  return useMemo(
    () => [
      {
        id: "working-copy",
        label: "View local changes",
        keywords: ["diff", "wc", "at"],
        run: () => setSpec(WC_SPEC),
      },
      {
        id: "open-help",
        label: "Open help",
        keywords: ["keyboard", "shortcuts", "docs"],
        run: () => setHelpOpen(true),
      },
      {
        id: "open-github",
        label: "Open repository on GitHub",
        keywords: ["repo", "remote", "browser"],
        detail: repo?.github ? repo.github.nameWithOwner : "No GitHub remote",
        disabled: !repo?.github,
        run: () => {
          if (repo?.github)
            window.open(repo.github.url, "_blank", "noreferrer");
        },
      },
      {
        id: "open-pr-url",
        label: "Open PR by URL",
        keywords: ["review", "external", "github"],
        detail: "Coming in #5",
        disabled: true,
        run: () => {},
      },
      {
        id: "describe-change",
        label: "Describe change...",
        keywords: ["stack", "commit", "picker", "message", "edit", "jj"],
        detail: pickableChangesCount ? "Pick one change" : "No stack changes",
        disabled: pickableChangesCount === 0,
        run: () => setStackAction("describe"),
      },
      {
        id: "abandon-change",
        label: "Abandon change...",
        keywords: ["stack", "commit", "picker", "delete", "drop"],
        detail: pickableChangesCount ? "Pick one change" : "No stack changes",
        disabled: pickableChangesCount === 0,
        run: () => setStackAction("abandon"),
      },
      {
        id: "absorb-change",
        label: "Absorb change...",
        keywords: ["stack", "commit", "picker", "fold"],
        detail: pickableChangesCount
          ? "Pick source change"
          : "No stack changes",
        disabled: pickableChangesCount === 0,
        run: () => setStackAction("absorb"),
      },
      {
        id: "squash-change",
        label: "Squash change...",
        keywords: ["stack", "commit", "picker", "combine", "parent", "fold"],
        detail: pickableChangesCount
          ? "Pick source, then destination"
          : "No stack changes",
        disabled: pickableChangesCount === 0,
        run: () => setStackAction("squash"),
      },
      {
        id: "split-change",
        label: "Split change...",
        keywords: ["stack", "commit", "picker", "hunk"],
        detail: "Deferred to #9",
        disabled: true,
        run: () => {},
      },
      {
        id: "launch-agent",
        label: "Launch agent...",
        keywords: ["feedback", "comments"],
        detail: "Planned",
        disabled: true,
        run: () => {},
      },
      {
        id: "new-change",
        label: "New change",
        keywords: ["stack", "commit", "empty", "jj"],
        detail: "jj new",
        run: () => runRepoAction({ action: "new" }, { viewWorkingCopy: true }),
      },
      {
        id: "bookmark-move",
        label: "Move bookmark...",
        keywords: ["bookmark", "backwards", "jj"],
        detail: pickableBookmarksCount
          ? "Pick bookmark, then destination"
          : "No bookmarks in stack",
        disabled: pickableBookmarksCount === 0,
        run: () => setStackAction("bookmark-move"),
      },
      {
        id: "tug",
        label: "Tug bookmarks",
        keywords: ["bookmark", "move", "pushable", "jj"],
        detail: "jj tug",
        run: () => runRepoAction({ action: "tug" }),
      },
      {
        id: "git-push",
        label: "Push to remote",
        keywords: ["push", "origin", "github", "sync", "jj"],
        detail: stack?.hasUnpushedWork ? "jj git push" : "Nothing to push",
        disabled: !stack?.hasUnpushedWork,
        run: () => runRepoAction({ action: "git-push" }),
      },
      {
        id: "refresh",
        label: "Refresh repository",
        keywords: ["reload", "snapshot", "jj"],
        run: handleRefresh,
      },
    ],
    [
      handleRefresh,
      pickableBookmarksCount,
      pickableChangesCount,
      repo,
      runRepoAction,
      setHelpOpen,
      setSpec,
      setStackAction,
      stack?.hasUnpushedWork,
    ],
  );
}
