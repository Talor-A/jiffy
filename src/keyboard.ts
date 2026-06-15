import { useEffect } from "react";

interface BooleanRef {
  current: boolean;
}

export interface KeyboardShortcutOptions {
  editingRef: BooleanRef;
  paletteOpen: boolean;
  onOpenPalette: () => void;
  onClosePalette: () => void;
}

export function useKeyboardShortcuts({
  editingRef,
  paletteOpen,
  onClosePalette,
  onOpenPalette,
}: KeyboardShortcutOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        // Inline editors and context menus handle Escape before global modals.
        if (editingRef.current || isContextMenuOpen()) return;
        if (paletteOpen) {
          event.preventDefault();
          onClosePalette();
          return;
        }

        return;
      }

      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        if (
          editingRef.current ||
          paletteOpen ||
          isContextMenuOpen() ||
          isTextEntryTarget(event.target)
        ) {
          return;
        }
        event.preventDefault();
        onOpenPalette();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingRef, paletteOpen, onOpenPalette, onClosePalette]);
}

function isContextMenuOpen(): boolean {
  return document.querySelector(".context-menu") !== null;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  const editable = target.closest("[contenteditable]");
  return editable instanceof HTMLElement && editable.isContentEditable;
}
