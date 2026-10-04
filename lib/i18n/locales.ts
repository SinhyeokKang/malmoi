/**
 * **화면 언어(UI locale)의 지원 집합과 판정** — 프로젝트의 번역 대상 언어(`Locale`)와 다른 축이라 식별자는
 * 전부 `uiLocale`·`UiLocale`이다(맨 `locale`을 쓰지 않는다 — grep 한 번으로 두 축이 섞인 코드를 찾는다).
 *
 * ⚠️ **잎이다 — import가 0이다.** 클라이언트 provider·날짜 헬퍼가 값으로 읽으므로 그래프가 곧 번들이다
 * (`components/__tests__/client-graph.test.ts`).
 */
export const UI_LOCALES = ["en", "ko", "es"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/**
 * 언어 이름은 **그 언어 자체의 표기(endonym)**이고 번역하지 않는다 — ko 화면에서 영어를 찾는 사람도 `English`를 읽어야 한다.
 * 판정 표를 겸한다: `parseUiLocale`이 이 객체의 own key로 지원 여부를 본다.
 */
export const UI_LOCALE_NAMES: Record<UiLocale, string> = { en: "English", ko: "한국어", es: "Español" };

/**
 * 쿠키·DB 값은 남이 정한 값이다 — 지원 집합 밖이면 `null`이고 호출부가 다음 층으로 넘어간다.
 * ⚠️ **`Object.hasOwn`으로 판정한다** — `in`·`?? 폴백`은 `__proto__`·`constructor`·`toString`을 통과시킨다(CLAUDE.md).
 * 대소문자·공백을 정규화하지 않는다 — 쓰는 쪽이 우리뿐이다.
 */
export function parseUiLocale(raw: unknown): UiLocale | null {
  return typeof raw === "string" && Object.hasOwn(UI_LOCALE_NAMES, raw) ? (raw as UiLocale) : null;
}

/**
 * **계정 > 기기 쿠키 > en.** ⚠️ `Accept-Language`는 입력에 없다 — 받을 자리가 없어서 읽을 수도 없다(처음 온 사용자는 항상 영어).
 * 계정 값이 지원 밖이면(언어를 목록에서 뺀 뒤 남은 값) 화면이 깨지지 않고 쿠키로 넘어간다.
 */
export function resolveUiLocale({ account, cookie }: { account: unknown; cookie: unknown }): UiLocale {
  return parseUiLocale(account) ?? parseUiLocale(cookie) ?? "en";
}

/**
 * 언어를 바꿀 때 어디에 쓰나. 쿠키는 항상 쓴다 — 로그인 중에도 써야 로그아웃 뒤 그 기기가 같은 언어를 본다.
 * 계정은 로그인했을 때만 쓴다 — 쿠키에만 쓰면 계정 값이 이겨 고른 언어가 무시된다.
 */
export function planUiLocaleWrite({ signedIn }: { signedIn: boolean }): { cookie: true; account: boolean } {
  return { cookie: true, account: signedIn };
}
