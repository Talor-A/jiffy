import { expect, test } from "bun:test";
import { Window } from "happy-dom";

const { document } = new Window();
import {
  globalShortcutsBlocked,
  isEditableTarget,
  type KeyboardGuardState,
} from "../src/keyboardShortcuts";

const idle: KeyboardGuardState = {
  editing: false,
  modalOpen: false,
  contextMenuOpen: false,
};

test("globalShortcutsBlocked when editing", () => {
  expect(
    globalShortcutsBlocked({ ...idle, editing: true }, document.body),
  ).toBe(true);
});

test("globalShortcutsBlocked when modal open", () => {
  expect(
    globalShortcutsBlocked({ ...idle, modalOpen: true }, document.body),
  ).toBe(true);
});

test("globalShortcutsBlocked when context menu open", () => {
  expect(
    globalShortcutsBlocked({ ...idle, contextMenuOpen: true }, document.body),
  ).toBe(true);
});

test("globalShortcutsBlocked when focus in input", () => {
  const input = document.createElement("input");
  document.body.appendChild(input);
  expect(globalShortcutsBlocked(idle, input)).toBe(true);
  input.remove();
});

test("globalShortcutsBlocked when focus in textarea", () => {
  const textarea = document.createElement("textarea");
  document.body.appendChild(textarea);
  expect(globalShortcutsBlocked(idle, textarea)).toBe(true);
  textarea.remove();
});

test("globalShortcutsBlocked when focus in contenteditable", () => {
  const div = document.createElement("div");
  div.setAttribute("contenteditable", "true");
  document.body.appendChild(div);
  expect(globalShortcutsBlocked(idle, div)).toBe(true);
  div.remove();
});

test("global shortcuts allowed when idle", () => {
  expect(globalShortcutsBlocked(idle, document.body)).toBe(false);
});

test("isEditableTarget detects input and textarea", () => {
  expect(isEditableTarget(document.createElement("input"))).toBe(true);
  expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
  expect(isEditableTarget(document.createElement("button"))).toBe(false);
});
