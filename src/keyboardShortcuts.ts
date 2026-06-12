import { useEffect, type RefObject } from "react";

export type KeyboardGuardState = {
  editing: boolean;
  modalOpen: boolean;
  contextMenuOpen: boolean;
};

export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object" || !("tagName" in target)) {
    return false;
  }
  const el = target as Element;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return typeof el.closest === "function" &&
    el.closest("[contenteditable='true']") !== null;
}

export function isContextMenuOpen(): boolean {
  return document.querySelector(".context-menu-positioner") !== null;
}

/** Global shortcuts are inactive when any guard condition is true. */
export function globalShortcutsBlocked(
  state: KeyboardGuardState,
  eventTarget: unknown,
): boolean {
  if (state.editing) return true;
  if (state.modalOpen) return true;
  if (state.contextMenuOpen) return true;
  if (isEditableTarget(eventTarget)) return true;
  return false;
}

type GlobalShortcutHandlers = {
  editingRef: RefObject<boolean>;
  helpOpen: boolean;
  paletteOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
};

/**
 * Root-level keyboard policy. Esc precedence: draft cancel (DiffViewer) →
 * context menu (Base UI) → command palette → help modal.
 */
export function useGlobalKeyboardShortcuts({
  editingRef,
  helpOpen,
  paletteOpen,
  setHelpOpen,
  setPaletteOpen,
}: GlobalShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const guard: KeyboardGuardState = {
        editing: editingRef.current,
        modalOpen: helpOpen || paletteOpen,
        contextMenuOpen: isContextMenuOpen(),
      };

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        if (globalShortcutsBlocked(guard, e.target)) return;
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }

      if (e.key !== "Escape") return;
      if (editingRef.current) return;
      if (isContextMenuOpen()) return;

      if (paletteOpen) {
        e.preventDefault();
        setPaletteOpen(false);
        return;
      }
      if (helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    editingRef,
    helpOpen,
    paletteOpen,
    setHelpOpen,
    setPaletteOpen,
  ]);
}
