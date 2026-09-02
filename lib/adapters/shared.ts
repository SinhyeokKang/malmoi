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

/**
 * 예제·픽스처·문서 디렉터리 — **감점 신호다** (2026-09-02 추가).
 *
 * 실측 오탐 4건 중 2건이 여기서 나왔다: lokalise/i18n-ally는 `examples/by-frameworks/…/_locales`가
 * 도구 자신의 `locales/`를 눌렀고, payloadcms/payload는 `examples/localization/…`이 진짜
 * `packages/translations`를 눌렀다. ant-design은 `.dumi/theme/locales`(문서 사이트 테마 2로케일)가
 * 잡혔다 (`docs/ADAPTER-COVERAGE.md` §1②).
 *
 * **배제가 아니라 감점이다** — 예제 모음 자체가 산출물인 리포에서 그것만 있으면 잡아야 한다.
 */
const ASIDE_HINT =
  /(^|\/)(examples?|fixtures?|__fixtures__|demos?|playground|samples?|tests?|__tests__|spec|docs?|\.dumi|storybook|\.storybook|node_modules|vendor)(\/|$)/i;

export function rankCandidates<T extends { dir: string; locales: Set<string> }>(candidates: readonly T[]): T[] {
  return candidates.slice().sort((a, b) => {
    const hint = Number(I18N_HINT.test(b.dir)) - Number(I18N_HINT.test(a.dir));
    if (hint !== 0) return hint;
    // 예제·픽스처는 뒤로. 신호가 같을 때만 갈리므로 진짜 카탈로그를 밀어내지 않는다.
    const aside = Number(ASIDE_HINT.test(a.dir)) - Number(ASIDE_HINT.test(b.dir));
    if (aside !== 0) return aside;
    if (b.locales.size !== a.locales.size) return b.locales.size - a.locales.size;
    return compareKeys(a.dir, b.dir);
  });
}

/** 샘플 하나의 판정. `unknown`은 "카탈로그 아님"이 아니라 **정보 없음**이다. */
export type CatalogVerdict = "yes" | "no" | "unknown";

/**
 * 후보 파일이 메시지 카탈로그 모양인가. 경로 신호만으로는 취약하므로 **내용을 본다**.
 *
 * ⚠️ **판정이 3값이다** (2026-09-02). 전에는 boolean이었고 "최상위 값이 **전부** 문자열·객체"를
 * 요구했는데, 그 규칙이 지원 포맷 리포 3개를 통째로 버렸다 (`docs/ADAPTER-COVERAGE.md` §3):
 *
 * - esmBot — 샘플이 `{}`였다. 빈 스텁 로케일은 "아님"이 아니라 **정보 없음**이다 → `unknown`
 * - jsxc — 최상위에 `"Notifications": null`
 * - scratchblocks — 최상위에 `percentTranslated`(숫자)
 *
 * 뒤 둘은 **메타데이터가 섞인 정상 카탈로그**다. 그래서 "전부"를 "문자열·객체 리프가 하나 이상이고
 * 절반 이상"으로 낮췄다. **완화한 것은 탐지 관문뿐이고 `read`는 그대로 엄격하다** — 그 값들은
 * 여전히 `errors`로 보고된다.
 */
export function catalogVerdict(content: string): CatalogVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return "no";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "no";
  return verdictFromValues(Object.values(parsed as Record<string, unknown>));
}

/** 파싱된 최상위 값 목록으로 판정한다 — YAML 어댑터가 같은 규칙을 쓴다. */
export function verdictFromValues(values: readonly unknown[]): CatalogVerdict {
  if (values.length === 0) return "unknown";
  const good = values.filter((v) => typeof v === "string" || (v !== null && typeof v === "object")).length;
  if (good === 0) return "no";
  return good * 2 >= values.length ? "yes" : "no";
}

/** @deprecated `catalogVerdict`를 쓴다. `unknown`을 `false`로 눌러버린다. */
export function looksLikeCatalog(content: string): boolean {
  return catalogVerdict(content) === "yes";
}

/** probe로 읽어볼 샘플 수 상한. GitHub API에서는 블롭 읽기가 요청 비용이다. */
const MAX_SAMPLES = 3;

/**
 * 샘플을 **여러 개** 읽어 카탈로그인지 확인한다. 하나라도 `yes`면 통과.
 *
 * 순서가 중요하다 — `en`(base 후보)을 먼저 본다. **정렬상 첫 로케일은 체계적으로 가장 덜 관리된
 * 파일이다**(`ab`·`ar`·`bg`가 앞에 오고 그게 빈 스텁이거나 null을 품는다). 그 하나로 리포 전체를
 * 버린 것이 위 세 실패의 공통 구조였다.
 */
export function verifySamples(
  pathTemplate: string,
  locales: ReadonlySet<string>,
  probe: (path: string) => string | undefined,
  verdict: (content: string) => CatalogVerdict = catalogVerdict,
): boolean {
  for (const locale of sampleOrder(locales)) {
    const content = probe(pathTemplate.replace("{locale}", locale));
    if (content === undefined) continue;
    if (verdict(content) === "yes") return true;
  }
  return false;
}

/** `en`을 먼저, 그다음 코드포인트 순. 상한까지만. */
export function sampleOrder(locales: ReadonlySet<string>): string[] {
  const rest = [...locales].filter((l) => l !== "en").sort(compareKeys);
  const ordered = locales.has("en") ? ["en", ...rest] : rest;
  return ordered.slice(0, MAX_SAMPLES);
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
