/**
 * **Chrome 확장이 받는 로케일 디렉터리 이름** — `chrome-locales` 소스의 언어 추가 입력은 이 목록에서만 고른다(locale-add design §2).
 *
 * 출처: https://developer.chrome.com/docs/extensions/reference/api/i18n#locales — 확인일 2026-10-14, 55개.
 *
 * ⚠️ **Chromium은 이 55개가 아니라 ICU 지원 목록과 대조한다** — 그쪽이 더 넓을 수 있지만 문서 목록으로 좁힌다(보수적인 쪽).
 * 목록 밖 디렉터리는 unpacked 로드에서 경고 없이 건너뛰므로, 여기서 받으면 "추가했는데 확장에 안 보이는" 언어가 생긴다.
 * 목록 밖 언어는 리포에서 직접 추가하면 기존 적재가 받는다.
 *
 * ⚠️ **밑줄 표기 그대로 정확 일치다** — 디렉터리 이름이라 `pt-BR`·`pt_br`은 다른 디렉터리다.
 *
 * 잎이다 — Add Dialog(클라이언트)가 값으로 읽는다. import를 더하지 않는다.
 */
export const CHROME_LOCALE_CODES: readonly string[] = [
  "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "en", "en_AU", "en_GB", "en_US", "es", "es_419", "et", "fa", "fi", "fil", "fr",
  "gu", "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt", "lv", "ml", "mr", "ms", "nl", "no", "pl", "pt_BR", "pt_PT",
  "ro", "ru", "sk", "sl", "sr", "sv", "sw", "ta", "te", "th", "tr", "uk", "vi", "zh_CN", "zh_TW",
];

// Set 조회라 `__proto__`·`constructor`가 프로토타입에서 찾아지지 않는다.
const CHROME_LOCALE_SET: ReadonlySet<string> = new Set(CHROME_LOCALE_CODES);

export function isChromeLocaleCode(code: string): boolean {
  return CHROME_LOCALE_SET.has(code);
}
