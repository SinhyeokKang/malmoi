/** IME confirmation belongs to the composition, not to the cell's save shortcut. */
export function editCommand(event: {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): "save" | "restore" | null {
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.key === "Enter" && !event.shiftKey) return "save";
  if (event.key === "Escape") return "restore";
  return null;
}
