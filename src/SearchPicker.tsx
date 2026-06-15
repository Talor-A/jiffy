import {
  createContext,
  use,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Command } from "cmdk";

interface SearchPickerContextValue {
  search: string;
  setSearch: (value: string) => void;
}

const SearchPickerContext = createContext<SearchPickerContextValue | null>(
  null,
);

function useSearchPicker(): SearchPickerContextValue {
  const ctx = use(SearchPickerContext);
  if (!ctx) {
    throw new Error("SearchPicker parts must be used within SearchPicker.Root");
  }
  return ctx;
}

function Root({
  open,
  title,
  defaultValue,
  panelClassName = "modal-panel command-panel",
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  defaultValue?: string;
  panelClassName?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <SearchPickerContext value={{ search, setSearch }}>
      <Command.Dialog
        open={open}
        onOpenChange={onOpenChange}
        label={title}
        loop
        defaultValue={defaultValue}
        vimBindings={false}
        overlayClassName="modal-overlay command-overlay"
        contentClassName={panelClassName}
      >
        {children}
      </Command.Dialog>
    </SearchPickerContext>
  );
}

function Header({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="commit-picker-header">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}

function Input({ placeholder }: { placeholder: string }) {
  const { search, setSearch } = useSearchPicker();
  return (
    <Command.Input
      autoFocus
      className="command-input"
      placeholder={placeholder}
      value={search}
      onValueChange={setSearch}
    />
  );
}

function List({
  emptyMessage,
  listClassName = "command-list",
  children,
}: {
  emptyMessage: string;
  listClassName?: string;
  children: ReactNode;
}) {
  return (
    <Command.List className={listClassName}>
      <Command.Empty className="command-empty">{emptyMessage}</Command.Empty>
      {children}
    </Command.List>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <Command.Group heading={heading} className="command-group">
      {children}
    </Command.Group>
  );
}

function Footer({
  enterLabel = "select",
}: {
  enterLabel?: "select" | "run";
}) {
  return (
    <div className="command-footer">
      <kbd>↑</kbd>
      <kbd>↓</kbd>
      <span>navigate</span>
      <kbd>Enter</kbd>
      <span>{enterLabel}</span>
      <kbd>Esc</kbd>
      <span>close</span>
    </div>
  );
}

export const SearchPicker = {
  Root,
  Header,
  Input,
  List,
  Group,
  Footer,
};
