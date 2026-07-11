import { describe, expect, it } from "vitest";

import {
  isNativeBrowserPasteShortcut,
  isTerminalCopyShortcut,
  isTerminalPasteShortcut,
} from "./terminal-clipboard";

const key = (overrides: Partial<KeyboardEvent> = {}) =>
  ({
    ctrlKey: false,
    key: "v",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;

describe("isNativeBrowserPasteShortcut", () => {
  it("accepts native Ctrl+V in browser-embedded terminals", () => {
    expect(isNativeBrowserPasteShortcut(key({ ctrlKey: true }), false)).toBe(true);
  });

  it("accepts native Cmd+V on macOS", () => {
    expect(isNativeBrowserPasteShortcut(key({ metaKey: true }), true)).toBe(true);
  });

  it("leaves shifted terminal-style paste chords for explicit handling", () => {
    expect(isNativeBrowserPasteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isNativeBrowserPasteShortcut(key({ metaKey: true, shiftKey: true }), true)).toBe(false);
  });
});

describe("isTerminalPasteShortcut", () => {
  it("keeps Ctrl+Shift+V working as a terminal-style paste fallback", () => {
    expect(isTerminalPasteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });

  it("accepts Ctrl+V on macOS as a Hermes fallback even though browsers do not", () => {
    expect(isTerminalPasteShortcut(key({ ctrlKey: true }), true)).toBe(true);
  });

  it("ignores unrelated shortcuts", () => {
    expect(isTerminalPasteShortcut(key({ ctrlKey: true, key: "c" }), false)).toBe(false);
    expect(isTerminalPasteShortcut(key({ key: "v" }), false)).toBe(false);
  });
});

describe("isTerminalCopyShortcut", () => {
  it("accepts native Ctrl+C so selected terminal text copies instead of interrupting", () => {
    expect(isTerminalCopyShortcut(key({ ctrlKey: true, key: "c" }))).toBe(true);
  });

  it("keeps Cmd+C and Ctrl+Shift+C copy paths", () => {
    expect(isTerminalCopyShortcut(key({ metaKey: true, key: "c" }))).toBe(true);
    expect(isTerminalCopyShortcut(key({ ctrlKey: true, key: "c", shiftKey: true }))).toBe(true);
  });

  it("ignores plain c and unrelated modifier chords", () => {
    expect(isTerminalCopyShortcut(key({ key: "c" }))).toBe(false);
    expect(isTerminalCopyShortcut(key({ ctrlKey: true, key: "v" }))).toBe(false);
  });
});
