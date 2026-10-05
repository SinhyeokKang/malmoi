/**
 * **화면 테마(color-scheme)의 지원 집합과 판정** — 식별자는 `colorScheme`이고 화면 라벨만 `Theme`이다(`theme`은 Tailwind `@theme`과 grep이 섞인다).
 *
 * ⚠️ **잎이다 — import가 0이다.** Preferences의 Theme 카드(클라이언트)가 값으로 읽는다(`components/__tests__/client-graph.test.ts`).
 * ⚠️ **OS 설정은 판정 입력이 아니다** — 서버는 모르고, System(`light dark`)의 해석은 CSS가 한다. 그래서 인라인 스크립트가 없다.
 */
export const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** 기기 쿠키 이름 — http-only라 클라이언트는 읽지 않는다(Theme 카드는 `<html data-theme>`만 쓴다). 서버 입구와 테마 바꾸기 Action이 같이 읽는다. */
export const COLOR_SCHEME_COOKIE = "malmoi-color-scheme";

/** `parseColorScheme`의 판정 표 — own key만 본다. */
const SUPPORTED: Record<ColorScheme, true> = { system: true, light: true, dark: true };

/**
 * 쿠키·DB 값은 남이 정한 값이다 — 지원 집합 밖이면 `null`이고 호출부가 다음 층으로 넘어간다.
 * ⚠️ **`Object.hasOwn`으로 판정한다** — `in`·`?? 폴백`은 `__proto__`·`constructor`·`toString`을 통과시킨다(CLAUDE.md).
 * 대소문자·공백을 정규화하지 않는다 — 쓰는 쪽이 우리뿐이다.
 */
export function parseColorScheme(raw: unknown): ColorScheme | null {
  return typeof raw === "string" && Object.hasOwn(SUPPORTED, raw) ? (raw as ColorScheme) : null;
}

/**
 * **계정 > 기기 쿠키 > system.** 계정 값이 지원 밖이면(값을 목록에서 뺀 뒤 남은 값) 화면이 깨지지 않고 쿠키로 넘어간다.
 * `resolveUiLocale`과 모양이 같지만 합치지 않는다 — 값 집합·기본값이 다르고 공통 "설정 저장소"는 선반영이다(design §3.3).
 */
export function resolveColorScheme({ account, cookie }: { account: unknown; cookie: unknown }): ColorScheme {
  return parseColorScheme(account) ?? parseColorScheme(cookie) ?? "system";
}
