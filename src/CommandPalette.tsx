import { useEffect, useState } from "react";
import { Command } from "cmdk";

export interface PaletteAction {
  id: string;
  label: string;
  keywords?: string[];
  detail?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export function CommandPalette({
  open,
  actions,
  onOpenChange,
}: {
  open: boolean;
  actions: PaletteAction[];
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const runAction = (action: PaletteAction) => {
    if (action.disabled) return;
    onOpenChange(false);
    void Promise.resolve(action.run()).catch(console.error);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Jiffy command palette"
      loop
      vimBindings={false}
      overlayClassName="modal-overlay command-overlay"
      contentClassName="modal-panel command-panel"
    >
      <Command.Input
        autoFocus
        className="command-input"
        placeholder="Search commands..."
        value={search}
        onValueChange={setSearch}
      />
      <Command.List className="command-list">
        <Command.Empty className="command-empty">
          No commands found.
        </Command.Empty>
        <Command.Group heading="Commands" className="command-group">
          {actions.map((action) => (
            <Command.Item
              key={action.id}
              value={action.label}
              keywords={action.keywords}
              disabled={action.disabled}
              className="command-item"
              onSelect={() => runAction(action)}
            >
              <span>{action.label}</span>
              {action.detail && (
                <span className="command-detail">{action.detail}</span>
              )}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="command-footer">
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <span>navigate</span>
        <kbd>Enter</kbd>
        <span>run</span>
        <kbd>Esc</kbd>
        <span>close</span>
      </div>
    </Command.Dialog>
  );
}
