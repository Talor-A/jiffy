import { Command } from "cmdk";
import { SearchPicker } from "./SearchPicker";

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
  const runAction = (action: PaletteAction) => {
    if (action.disabled) return;
    onOpenChange(false);
    void Promise.resolve(action.run()).catch(console.error);
  };

  return (
    <SearchPicker.Root
      open={open}
      title="Jiffy command palette"
      onOpenChange={onOpenChange}
    >
      <SearchPicker.Input placeholder="Search commands..." />
      <SearchPicker.List emptyMessage="No commands found.">
        <SearchPicker.Group heading="Commands">
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
        </SearchPicker.Group>
      </SearchPicker.List>
      <SearchPicker.Footer enterLabel="run" />
    </SearchPicker.Root>
  );
}
