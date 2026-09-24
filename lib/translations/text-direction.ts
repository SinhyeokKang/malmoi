/**
 * 로케일 코드 → 값 셀의 `dir`·`lang` (malmoi#91).
 *
 * ⚠️ **셀이 페이지의 `lang="en"`·`ltr`을 상속하면 RTL 값이 거꾸로 선다** — 번역자는 실제 문자열을 고치는데
 * `.` `(` `)` `?` 같은 중립 문자가 반대 끝으로 튄다. 그래서 값을 담는 요소가 자기 방향과 언어를 든다.
 *
 * 판정 순서: 명시한 script 서브태그 → 코드만으로 모르는 언어(`auto`) → `Intl.Locale#getTextInfo` → 표.
 */
export type TextDirection = "ltr" | "rtl" | "auto";

const RTL_SCRIPTS = new Set(["Arab", "Hebr", "Syrc", "Thaa", "Nkoo", "Adlm", "Rohg", "Mand", "Samr", "Mend", "Yezi"]);

/**
 * ⚠️ **코드만으로 방향을 모르는 언어** — 쿠르드어는 CLDR이 `ku`를 Latin(ltr)으로 보지만 소라니(아랍 문자)를
 * 같은 코드에 담는 리포가 있다(#91의 `ku-TR`). 단정하면 둘 중 하나가 거꾸로 서므로 값이 정한다.
 */
const AMBIGUOUS = new Set(["ku"]);

/** `getTextInfo`가 없는 런타임의 폴백 — 언어 부분만 본다. */
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "iw", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "syr", "arc", "ks", "prs", "azb", "mzn", "glk", "lrc", "bal", "ji"]);

export function rtlByTable(language: string): boolean {
  return RTL_LANGUAGES.has(language.toLowerCase());
}

type TextInfoLocale = Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };

export function localeTextAttrs(code: string): { dir: TextDirection; lang: string | undefined } {
  let locale: TextInfoLocale;
  try {
    locale = new Intl.Locale(code.replaceAll("_", "-"));
  } catch {
    return { dir: "auto", lang: undefined };
  }
  const lang = locale.toString();
  if (locale.script !== undefined) return { dir: RTL_SCRIPTS.has(locale.script) ? "rtl" : "ltr", lang };
  if (AMBIGUOUS.has(locale.language)) return { dir: "auto", lang };
  const info = locale.getTextInfo?.() ?? locale.textInfo;
  if (info?.direction === "rtl" || info?.direction === "ltr") return { dir: info.direction, lang };
  return { dir: rtlByTable(locale.language) ? "rtl" : "ltr", lang };
}
