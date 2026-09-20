export const PROJECT_NAME_MAX_CHARS = 200;

export function planProjectName(raw: string): { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" } {
  const name = raw.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (name.length > PROJECT_NAME_MAX_CHARS) return { ok: false, reason: "too-long" };
  return { ok: true, name };
}
