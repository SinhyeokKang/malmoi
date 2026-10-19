/**
 * **언어 추가 Dialog의 프리셋** (locale-add 결정 D8·D9 · 시안 A1). json 소스의 추가 칸은 이 목록 + 자유 입력이다 — 목록은 사용자가 요청한
 * 기능이고(범위 판정 끝), 받을지 말지는 서버 미리보기(`previewSourceLocaleAdd`)가 정한다. 여기에는 표시 규칙만 둔다.
 *
 * ⚠️ **잎이다** — Add Dialog(클라이언트)가 값으로 읽는다. import를 더하지 않는다(`client-graph.test.ts`).
 * ⚠️ Chrome 소스는 이 목록을 쓰지 않는다 — 포맷이 받는 디렉터리 이름이 정해져 있어 `CHROME_LOCALE_CODES`에서만 고른다.
 */

/** 하이픈 철자의 고정 목록 — 화면은 `presetCodes`로 소스의 구분자에 맞춰 읽는다. 순서는 코드순(목록이 짧아 이름순으로 다시 고르지 않는다). */
export const COMMON_LANGUAGES: readonly string[] = [
  "ar", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt-BR", "pt-PT", "ru", "sv", "th", "tr", "uk", "vi", "zh-CN", "zh-TW",
];

/**
 * 프리셋 구분자 — **소스의 지역 있는 코드가 정한다**(D9). `pt_BR` 꼴만 있으면 밑줄, 그 밖(하이픈만 · 섞임 · 지역 있는 코드 없음)은 하이픈이다.
 * 밑줄 소스에 `pt-BR` 프리셋을 내면 서버가 `locale-collision`으로 막을 철자를 목록이 권하게 된다.
 */
export function presetSeparator(codes: readonly string[]): "-" | "_" {
  const regional = codes.filter(code => /[-_]/.test(code));
  return regional.length > 0 && regional.every(code => code.includes("_") && !code.includes("-")) ? "_" : "-";
}

/** Android 리소스는 현대 언어 별칭 대신 레거시 코드와 `-r` 지역 철자를 쓴다. 저장된 코드를 바꾸는 데 쓰지 않는다. */
export function androidResourceCode(code: string): string {
  const legacy: Readonly<Record<string, string>> = { he: "iw", id: "in", yi: "ji" };
  return code.replace(/^(he|id|yi)(?=-|$)/, language => (legacy[language] ?? language)).replace(/-([A-Z]{2})$/, "-r$1");
}

export function presetCodes(separator: "-" | "_", adapterName?: string): readonly string[] {
  if (adapterName === "android-strings") return COMMON_LANGUAGES.map(androidResourceCode);
  return separator === "-" ? COMMON_LANGUAGES : COMMON_LANGUAGES.map(code => code.replaceAll("-", "_"));
}

/**
 * 이름 조회용 코드 — 밑줄을 하이픈으로. ⚠️ **표시용으로만 쓴다**: `Intl.DisplayNames`는 밑줄 코드(`en_AU`)에 `RangeError`라 `languageName`이 코드를
 * 그대로 돌려준다(실측). 값·제출은 원래 코드다.
 */
export function nameKey(code: string): string {
  return code.replaceAll("_", "-");
}

const squash = (text: string) => text.toLowerCase().replace(/[-_\s]/g, "");

/**
 * 입력으로 프리셋 행을 거른다 — 코드 앞부분(구분자·대소문자 무시) 또는 이름 일부. 지역을 붙여 친 코드(`fr-CA`)는 지역 없는 같은 언어(`fr`)를
 * 남긴다(시안 A1 ①′) — 목록 밖 코드 자체는 `Use this code` 행이 받는다.
 */
export function matchesLanguage(code: string, name: string, query: string): boolean {
  const typed = query.trim();
  if (typed === "") return true;
  if (squash(code).startsWith(squash(typed))) return true;
  if (name.toLowerCase().includes(typed.toLowerCase())) return true;
  const language = typed.split(/[-_]/)[0]?.toLowerCase();
  return /[-_]/.test(typed) && !/[-_]/.test(code) && language === code.toLowerCase();
}

/**
 * 미리보기를 부를 만큼 코드 모양인가 — **최종 판정이 아니다**. 일부러 서버보다 넓다: `es-419`·`KO`도 부르고 서버의 `invalid-code`가 "다시 읽을 수
 * 없는 코드"라는 다음 행동 문장을 낸다(시안 A2). 이 모양이 아닌 입력은 서버를 부르지 않고 모양 안내를 낸다.
 */
export function looksLikeCodeInput(text: string): boolean {
  return /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(text);
}
