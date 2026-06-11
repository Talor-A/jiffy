import { useCallback, useEffect, useState } from "react";

export interface MenuItem {
  label: string;
  /** Copied to the clipboard when the item is clicked. */
  value: string;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export type OpenMenu = (e: React.MouseEvent, items: MenuItem[]) => void;

/**
 * Minimal right-click menu: every item is a copy-to-clipboard action.
 * `open` is passed down to anything that wants a menu; the rendered menu
 * lives once at the app root.
 */
export function useContextMenu(): { menu: React.ReactNode; open: OpenMenu } {
  const [state, setState] = useState<MenuState | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const open = useCallback<OpenMenu>((e, items) => {
    if (items.length === 0) return;
    // With text selected, the user wants the browser's own copy menu.
    if (window.getSelection()?.toString()) return;
    e.preventDefault();
    e.stopPropagation();
    setCopiedLabel(null);
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => {
    setState(null);
    setCopiedLabel(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [state, close]);

  const copy = useCallback(
    async (item: MenuItem) => {
      await navigator.clipboard.writeText(item.value);
      setCopiedLabel(item.label);
      setTimeout(close, 450);
    },
    [close],
  );

  const menu = state ? (
    <div
      className="context-menu"
      style={{
        left: Math.min(state.x, window.innerWidth - 240),
        top: Math.min(state.y, window.innerHeight - state.items.length * 30 - 16),
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.items.map((item) => (
        <button
          key={item.label}
          className="context-menu-item"
          onClick={() => void copy(item)}
        >
          <span>{copiedLabel === item.label ? "copied ✓" : item.label}</span>
          <code className="context-menu-value">{truncate(item.value, 28)}</code>
        </button>
      ))}
    </div>
  ) : null;

  return { menu, open };
}

function truncate(value: string, max: number): string {
  const oneLine = value.split("\n", 1)[0] ?? "";
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}
