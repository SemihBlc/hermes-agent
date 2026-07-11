export interface TerminalClipboardShortcutEvent {
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

function isShortcutKey(
  event: TerminalClipboardShortcutEvent,
  key: string,
): boolean {
  return event.key.toLowerCase() === key;
}

export function isNativeBrowserPasteShortcut(
  event: TerminalClipboardShortcutEvent,
  isMac: boolean,
): boolean {
  if (!isShortcutKey(event, "v") || event.shiftKey) {
    return false;
  }

  return isMac ? event.metaKey : event.ctrlKey;
}

export function isTerminalPasteShortcut(
  event: TerminalClipboardShortcutEvent,
  isMac: boolean,
): boolean {
  if (!isShortcutKey(event, "v")) {
    return false;
  }

  return isMac ? event.metaKey || event.ctrlKey : event.ctrlKey;
}

export function isTerminalCopyShortcut(
  event: TerminalClipboardShortcutEvent,
): boolean {
  return isShortcutKey(event, "c") && (event.metaKey || event.ctrlKey);
}
