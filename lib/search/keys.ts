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

export function reconcileActive(_prevIds: readonly string[], nextIds: readonly string[], activeId: string | null, queryChanged: boolean): string | null {
  return !queryChanged && activeId !== null && nextIds.includes(activeId) ? activeId : nextIds[0] ?? null;
}
