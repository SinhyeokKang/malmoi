/** IME 확정 입력은 조합의 것이지 셀 저장 단축키의 것이 아니다. */
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
