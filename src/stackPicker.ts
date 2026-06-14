import type { ActionRequest, ChangeInfo } from "../lib/schema";

export type PickerActionKind =
  | "abandon"
  | "absorb"
  | "squash"
  | "describe"
  | "bookmark-move";

export const STACK_ACTION_CONFIG: Record<
  Exclude<PickerActionKind, "bookmark-move">,
  {
    title: string;
    detail: string;
    actionLabel: string;
    confirmVerb: string;
  }
> = {
  abandon: {
    title: "Abandon Change",
    detail:
      "Pick one mutable change to abandon. Descendants will be rebased by jj.",
    actionLabel: "Abandon",
    confirmVerb: "Abandon",
  },
  absorb: {
    title: "Absorb Change",
    detail:
      "Pick a source change; jj will move edits into the mutable ancestors that last touched those lines.",
    actionLabel: "Absorb",
    confirmVerb: "Absorb from",
  },
  squash: {
    title: "Squash: Pick Source",
    detail:
      "Pick the change to squash. You'll pick the destination it folds into next.",
    actionLabel: "Squash",
    confirmVerb: "Squash",
  },
  describe: {
    title: "Describe Change",
    detail: "Pick a mutable change to edit its description.",
    actionLabel: "Describe",
    confirmVerb: "Describe",
  },
};

export function bookmarkMoveDestinationConfig(bookmarkName: string): {
  title: string;
  detail: string;
  actionLabel: string;
} {
  return {
    title: "Move Bookmark: Pick Destination",
    detail: `Move ${bookmarkName} to the destination change.`,
    actionLabel: "Move to",
  };
}

export function squashIntoConfig(source: ChangeInfo): {
  title: string;
  detail: string;
  actionLabel: string;
} {
  return {
    title: "Squash: Pick Destination",
    detail: `Move ${changeLabel(source)} into the destination, keeping the destination's description.`,
    actionLabel: "Squash into",
  };
}

export function changeLabel(change: ChangeInfo): string {
  const summary =
    change.description.split("\n", 1)[0]?.trim() || "(no description)";
  return `${change.changeIdPrefix} "${summary}"`;
}

export function stackActionRequest(
  kind: "abandon" | "absorb",
  change: ChangeInfo,
): ActionRequest {
  switch (kind) {
    case "abandon":
      return { action: "abandon", changeIds: [change.changeId] };
    case "absorb":
      return { action: "absorb", changeId: change.changeId };
  }
}
