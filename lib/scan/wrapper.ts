import type { WrapperId } from "./types";

/**
 * `--wrapper` 스펙을 판정한다. **CLI 둘이 각자 파싱하던 것을 여기로 모았다** — 형식에
 * `()`가 붙으면서 두 곳이 갈리면 한쪽만 훅을 못 읽는 상태가 조용히 생긴다.
 *
 *   `@/i18n#t`                        → direct (import한 export를 그대로 부른다)
 *   `next-intl#useTranslations()`     → hook   (부른 결과가 실제 호출자다)
 */
export function parseWrapperSpec(raw: string): WrapperId | undefined {
  const hook = raw.endsWith("()");
  const body = hook ? raw.slice(0, -2) : raw;
  // 모듈 경로에 `#`이 들어갈 수 있어 마지막 것으로 가른다.
  const at = body.lastIndexOf("#");
  if (at <= 0 || at === body.length - 1) return undefined;
  return { module: body.slice(0, at), export: body.slice(at + 1), kind: hook ? "hook" : "direct" };
}

/** 사람이 읽는 출력용. `parseWrapperSpec`으로 그대로 되돌아간다. */
export function formatWrapperSpec(w: WrapperId): string {
  return `${w.module}#${w.export}${w.kind === "hook" ? "()" : ""}`;
}
