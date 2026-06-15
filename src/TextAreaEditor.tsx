/** Ref callback that focuses a textarea with the cursor at the end. */
export function focusWhenConnected(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  let attempts = 60;
  const tryFocus = () => {
    if (el.isConnected) {
      el.focus();
      const root = el.getRootNode() as Document | ShadowRoot;
      if (root.activeElement === el) {
        el.setSelectionRange(el.value.length, el.value.length);
        return;
      }
    }
    if (attempts-- > 0) requestAnimationFrame(tryFocus);
  };
  tryFocus();
}

export function TextAreaEditor({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder,
  saveLabel,
  saving = false,
  wrapperClassName = "comment-card",
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  placeholder: string;
  saveLabel: string;
  saving?: boolean;
  wrapperClassName?: string;
  autoFocus?: boolean;
}) {
  const trimmed = value.trim();
  const save = () => {
    if (trimmed.length === 0 || saving) return;
    void Promise.resolve(onSave()).catch(console.error);
  };

  return (
    <div className={wrapperClassName}>
      <textarea
        ref={autoFocus ? focusWhenConnected : undefined}
        className="comment-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="comment-actions">
        <button
          className="primary"
          disabled={saving || trimmed.length === 0}
          onClick={() => void save()}
        >
          {saveLabel}
        </button>
        <button className="ghost" onClick={onCancel}>
          cancel
        </button>
      </div>
    </div>
  );
}
