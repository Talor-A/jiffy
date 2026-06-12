import { Command } from "cmdk";

export type PaletteAction = {
  id: string;
  label: string;
  keywords?: string[];
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: PaletteAction[];
}) {
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="cmdk-dialog"
      overlayClassName="cmdk-overlay"
    >
      <Command.Input placeholder="Type a command…" autoFocus />
      <Command.List>
        <Command.Empty>No matching commands.</Command.Empty>
        {actions.map((action) => (
          <Command.Item
            key={action.id}
            value={action.id}
            keywords={action.keywords}
            disabled={action.disabled}
            onSelect={() => {
              if (action.disabled) return;
              action.run();
              onOpenChange(false);
            }}
          >
            <span>{action.label}</span>
            {action.disabled && (
              <span className="cmdk-item-hint">coming soon</span>
            )}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
