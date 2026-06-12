import type { ReactElement } from "react";
import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";

export type MenuItem =
  | { kind: "copy"; label: string; value: string }
  | { kind: "action"; label: string; onSelect: () => void; disabled?: boolean }
  | { kind: "separator" };

export function copyItem(label: string, value: string): MenuItem {
  return { kind: "copy", label, value };
}

/**
 * Right-click menu built on Base UI ContextMenu. Base UI owns pointer
 * positioning and dismissal; callers only provide the trigger element and items.
 */
export function ContextMenu({
  items,
  children,
}: {
  items: MenuItem[];
  children: ReactElement;
}) {
  return (
    <BaseContextMenu.Root disabled={items.length === 0}>
      <BaseContextMenu.Trigger
        render={children}
        onContextMenu={(event) => {
          // With text selected, the user wants the browser's own copy menu.
          if (window.getSelection()?.toString()) {
            event.preventBaseUIHandler();
          }
        }}
      />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner align="start" className="context-menu-positioner">
          <BaseContextMenu.Popup className="context-menu">
            {items.map((item, index) => (
              <MenuItemRow key={menuItemKey(item, index)} item={item} />
            ))}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}

function menuItemKey(item: MenuItem, index: number): string {
  if (item.kind === "separator") return `sep-${index}`;
  return `${item.kind}-${item.label}-${index}`;
}

function MenuItemRow({ item }: { item: MenuItem }) {
  if (item.kind === "separator") {
    return <BaseContextMenu.Separator className="context-menu-separator" />;
  }

  if (item.kind === "copy") {
    return (
      <BaseContextMenu.Item
        className="context-menu-item"
        onClick={() => void navigator.clipboard.writeText(item.value)}
      >
        <span>{item.label}</span>
        <code className="context-menu-value">{truncate(item.value, 28)}</code>
      </BaseContextMenu.Item>
    );
  }

  return (
    <BaseContextMenu.Item
      className="context-menu-item"
      disabled={item.disabled}
      onClick={item.onSelect}
    >
      <span>{item.label}</span>
    </BaseContextMenu.Item>
  );
}

function truncate(value: string, max: number): string {
  const oneLine = value.split("\n", 1)[0] ?? "";
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}
