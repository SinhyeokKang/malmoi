import { m } from "@/lib/i18n";

/**
 * [Add selected sources]가 꺼진 사유 — 막은 갈래의 문장이고, 막는 것이 없으면 `null`이다 (malmoi#93).
 *
 * ⚠️ **`null`이면 문장도 `aria-describedby`도 서지 않는다** — 전엔 켜진 버튼에도 `Select at least one new source to add.`가 서고
 * 그것을 가리켜 "하나 이상 고르라"로 낭독됐다. ⚠️ **순서가 우선순위다** — 탐지 중·실패면 고를 후보가 아직 없어 뒤의 갈래가 거짓이 된다.
 */
export function planAddBlock({ detecting, detectError, formats, conflicts }: {
  detecting: boolean; detectError: boolean; formats: readonly { baseLocale?: string | null }[]; conflicts: number;
}): string | null {
  const s = m.settings.sources;
  if (detecting) return s.blocked.detecting;
  if (detectError) return s.blocked.detectFailed;
  if (formats.length === 0) return s.selectHelp;
  if (conflicts > 0) return s.blocked.conflict;
  if (formats.some(f => !f.baseLocale)) return s.blocked.base;
  return null;
}
