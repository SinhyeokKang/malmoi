export function shouldIgnoreShortcut(target: EventTarget | null, doc: Document): boolean {
  const element = target instanceof Element ? target : null;
  if (element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return true;
  return doc.querySelector('[role="dialog"], [role="menu"]') !== null;
}

export function nextActive(ids: readonly string[], activeId: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const current = activeId === null ? -1 : ids.indexOf(activeId);
  if (current === -1) return (delta === 1 ? ids[0] : ids.at(-1)) ?? null;
  return ids[(current + delta + ids.length) % ids.length] ?? null;
}

/**
 * 목록이 바뀐 뒤의 활성 행. **사용자가 ↑↓·hover로 옮기기 전엔 첫 행을 따라간다** (2026-10-03 사용자) — 첫 열림에 늦게 온 그룹이
 * 위에 끼면 활성이 `Go to docs`나 아래 행에 남아 Enter의 목적지가 응답 순서에 달렸다. 옮긴 뒤에만 늦은 그룹 도착에도 그 id를 지킨다.
 * 질의가 바뀌거나 옮긴 id가 사라지면 다시 "옮기지 않음"(첫 행)이다.
 */
export function reconcileActive(nextIds: readonly string[], current: { activeId: string | null; moved: boolean }, queryChanged: boolean): { activeId: string | null; moved: boolean } {
  const keep = !queryChanged && current.moved && current.activeId !== null && nextIds.includes(current.activeId);
  return keep ? { activeId: current.activeId, moved: true } : { activeId: nextIds[0] ?? null, moved: false };
}
