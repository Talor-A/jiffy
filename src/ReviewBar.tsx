import { useState } from "react";
import { finishReview } from "./api";

/** Verdict controls shown only when jiffy runs with --wait. */
export function ReviewBar({
  commentCount,
  onFinished,
}: {
  commentCount: number;
  onFinished: (verdict: "approve" | "request-changes") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (verdict: "approve" | "request-changes") => {
    if (
      verdict === "approve" &&
      commentCount > 0 &&
      !window.confirm(
        `You have ${commentCount} comment${commentCount === 1 ? "" : "s"} that will NOT be sent. Approve anyway?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await finishReview(verdict);
      onFinished(verdict);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <footer className="review-bar">
      {error && <div className="review-bar-error">{error}</div>}
      <button
        type="button"
        className="review-approve"
        disabled={busy}
        onClick={() => void submit("approve")}
      >
        approve
      </button>
      <button
        type="button"
        className="review-request-changes"
        disabled={busy || commentCount === 0}
        title={commentCount === 0 ? "add a comment first" : undefined}
        onClick={() => void submit("request-changes")}
      >
        request changes{commentCount > 0 ? ` (${commentCount})` : ""}
      </button>
    </footer>
  );
}
