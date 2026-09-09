/**
 * 기준 로케일 변경의 순수 판정 (translation-ui design §3.13, 6b-3).
 *
 * ⚠️ **`orphaned`를 거부하는 것이 이 함수의 요지다.** 그 로케일 파일은 리포에서 사라졌고 행만
 * 남아 있다(ARCHITECTURE §5.5.16) — base로 세우면 **다음 push가 그 파일을 못 읽어 키 집합이 0**이
 * 되고, 살아 있던 키 전부가 orphaned로 떨어진다. 되돌릴 수는 있지만(플래그다) 그 사이 편집자는
 * 빈 화면을 본다.
 *
 * ⚠️ **대소문자·구분자를 접지 않는다.** `DetectedFormat.locales`는 **파일명 그대로**가 진실이라
 * `zh_CN`과 `zh-CN`은 다른 로케일이다 — 어디서 한 번이라도 정규화하면 write가 존재하지 않는
 * 경로를 만든다.
 */
export type BaseLocaleChange = "noop" | "ok" | "unknown-locale" | "orphaned-locale";

export function planBaseLocaleChange(input: {
  /** 지금의 **현실**(`Project.baseLocale`). 첫 push 전이면 null이다. */
  current: string | null;
  next: string;
  locales: readonly { code: string; orphaned: boolean }[];
}): BaseLocaleChange {
  if (input.next === input.current) return "noop";
  // `current`가 목록에 없어도(그 로케일 파일이 사라진 경우) `next` 판정은 독립이다.
  const found = input.locales.find((l) => l.code === input.next);
  if (found === undefined) return "unknown-locale";
  return found.orphaned ? "orphaned-locale" : "ok";
}
