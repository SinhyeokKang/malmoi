import type { LocaleEntry } from "./types";

/**
 * 모든 writer가 공유하는 결정성 규칙 (MVP §4.1).
 *
 * **불변식: 같은 입력 → 언제나 바이트 단위로 같은 출력.** 깨지면 pull의 blob SHA 비교가 매번
 * "변경됨"을 뱉어 야간 cron이 무의미한 커밋을 쌓고 PR diff가 노이즈로 덮인다.
 */

/** `<` 비교 = UTF-16 코드 유닛 순서. `localeCompare`는 Node ICU 빌드에 의존해 불변식이 환경에 묶인다. */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 들여쓰기 2칸 + 파일 끝 개행 정확히 1개. `JSON.stringify`는 개행을 붙이지 않는다. */
export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * 낼 항목을 고른다 — 미번역 제외, 키 정렬.
 *
 * 빈 문자열도 미번역으로 취급한다(편집 UI에서 값을 지우면 그렇게 들어온다). 미번역 항목을
 * 남기면 그 값이 그대로 렌더되는데, 빼면 폴백한다.
 */
export function usableEntries(entries: readonly LocaleEntry[]): LocaleEntry[] {
  return entries
    // orphaned = 코드에서 사라진 키. DB엔 남기고 파일에서만 뺀다 — 되돌릴 수 있어야 한다.
    // **모든 writer가 이 함수를 지나야 이 불변식에 주인이 생긴다.**
    .filter((e) => e.orphaned !== true)
    .filter((e) => e.message !== "")
    .sort((a, b) => compareKeys(a.key, b.key));
}

/** 로케일 코드로 보이는 파일/디렉터리 이름인가. `zh-CN` 같은 지역 서브태그를 포함한다. */
export function looksLikeLocale(name: string): boolean {
  return /^[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/.test(name);
}

/**
 * 후보 순위 결정. **경로 사전순으로 고르면 안 된다** — bugshot-web에서 `public/search/{locale}.json`
 * (검색 인덱스, 최상위가 배열)이 `src/lib/i18n/{locale}.json`보다 먼저 잡혔다.
 *
 * 신호 둘을 쓴다: 경로에 i18n 계열 이름이 있는가, 로케일이 몇 개인가.
 */
const I18N_HINT = /(^|\/)(i18n|locale|locales|lang|langs|messages|translation|translations)(\/|$)/i;

export function rankCandidates<T extends { dir: string; locales: Set<string> }>(candidates: readonly T[]): T[] {
  return candidates.slice().sort((a, b) => {
    const hint = Number(I18N_HINT.test(b.dir)) - Number(I18N_HINT.test(a.dir));
    if (hint !== 0) return hint;
    if (b.locales.size !== a.locales.size) return b.locales.size - a.locales.size;
    return compareKeys(a.dir, b.dir);
  });
}

/**
 * 후보 파일이 메시지 카탈로그 모양인가. 경로 신호만으로는 취약하므로 **내용을 한 번 본다**.
 *
 * 호출부가 파일을 읽어줄 수 있을 때만 쓴다(`probe`) — GitHub API에서는 블롭 읽기가 비싸서
 * 경로로 후보를 좁힌 뒤 그 후보 하나만 확인한다.
 */
export function looksLikeCatalog(content: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const values = Object.values(parsed as Record<string, unknown>);
  if (values.length === 0) return false;
  // 리프가 문자열이거나 객체/배열이어야 한다. 숫자·불린만 있으면 카탈로그가 아니다.
  return values.every((v) => typeof v === "string" || (v !== null && typeof v === "object"));
}

/**
 * 키에서 namespace를 파생한다 — **첫 구분자 앞부분**.
 *
 * 구분자가 둘인 이유는 포맷이 둘이기 때문이다: chrome은 키에 `[A-Za-z0-9_@]`만 허용해
 * `popup_title` 같은 밑줄 접두사를 쓰고, json-catalog은 `common.viewAll` 같은 점 표기를 쓴다.
 * 어느 쪽이 먼저 나오든 그 앞이 namespace다.
 *
 * 구분자가 없거나 맨 앞에 있으면 `_root`다 — 빈 문자열 namespace를 만들면 사이드바에
 * 이름 없는 그룹이 생긴다.
 */
export function namespaceOf(key: string): string {
  const at = key.search(/[._]/);
  return at <= 0 ? "_root" : key.slice(0, at);
}
