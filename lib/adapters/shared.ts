import { matchesGlob } from "./glob";
import { serializeJson } from "./json-style";
import type { LocaleEntry, ReadResult } from "./types";

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

/**
 * 글롭 `pathTemplate`이 가리키는 파일들 — **`multi-locale` 어댑터(`ts-dict`)의 유일한 경로 규칙이다.**
 *
 * ⚠️ **`*`는 `/`를 먹지 않는다.** 먹게 두면 하위 디렉터리의 엉뚱한 파일을 로케일 파일로 읽는다.
 *
 * ⚠️ **정규식이 아니라 DP다** (2026-09-10, sec-audit-2 발견 35). 전에는 메타문자를 이스케이프해
 * `RegExp`로 컴파일했는데, 이스케이프는 **주입**을 막을 뿐 인접한 `[^/]*` 여러 개가 매칭 **실패**
 * 경로에서 만드는 지수 시간을 막지 못했다 — 비용을 키우는 것이 템플릿이 아니라 **매칭 대상 경로의
 * 길이**여서 템플릿만 재는 예산으로는 상한이 안 섰다. `matchesGlob`은 조합을 탐색하지 않는다.
 * 지원하는 와일드카드는 `*` 하나이고 `?`를 포함한 나머지는 전부 리터럴이다.
 *
 * ⚠️ **push·pull·survey가 이 함수를 공유한다** (2026-09-04). 셋이 각자 규칙을 들었던 동안 push는
 * 하위 디렉터리와 `.tsx`를 포함하고 pull의 글롭은 둘 다 뺐다 — 그 차이에 걸린 파일은 **키가 DB에
 * 적재되고 편집 UI에 뜨는데 pull이 그 파일을 영영 쓰지 않는다.** 에러도 경고도 없다.
 *
 * **확장자의 진실은 `pathTemplate`이다.** `.tsx`를 담아야 하면 `detect`가 `*.tsx`를 내야 한다 —
 * 선택 층에서 확장자를 넓히면 그 층만 아는 규칙이 다시 생긴다.
 *
 * 정렬해 돌려준다: 이 순서가 트리 페이로드 순서가 되고, 흔들리면 커밋이 비결정적이 된다.
 */
export function matchGlobPaths(pathTemplate: string, paths: readonly string[]): string[] {
  if (exceedsGlobBudget(pathTemplate)) return [];
  return paths.filter((p) => matchesGlob(pathTemplate, p)).sort(compareKeys);
}

/** 인접 양자로 컴파일되는 자리 — `*`와 `{locale}` 둘이다. */
const GLOB_QUANTIFIER = /\*|\{locale\}/g;
/** 인접 `k`개는 매칭 실패에서 문자열을 k조각으로 나누는 경우를 훑는다 — 실제 템플릿은 1개다. */
const MAX_GLOB_QUANTIFIERS = 4;
/** DP 표가 `템플릿 × 경로`라 템플릿 쪽 변을 여기서 묶는다. */
const MAX_TEMPLATE_LENGTH = 200;

/**
 * 이 템플릿으로 매칭해도 되는가 — **아니면 어느 파일도 고르지 않는다** (sec-audit 발견 11).
 *
 * 값을 정하는 것은 클라이언트다(`CreateProjectInput` · `PushPayload.format`). 상한을 넘으면 빈
 * 배열이라 pull이 `fail("the glob matched no files")`로 **시끄럽게** 멈춘다 — 조용히 통과시키는
 * 것보다 낫고, 어느 파일도 안 고르는 쪽이 안전한 기본값이다.
 *
 * ⚠️ **저장된 템플릿에도 걸려야 한다.** 스키마 경계만 좁히면 이미 DB에 있는 값이 야간 cron에서
 * 그대로 쓰인다 — 그래서 판정이 순수 함수 안에 있다.
 *
 * ⚠️ **DP 전환(발견 35) 뒤에도 이 예산이 남는 이유는 갈래가 둘이기 때문이다.** `matchGlobPaths`는
 * 이제 역추적을 하지 않으니 길이 상한만으로 충분하지만, `lib/onboarding/confirm.ts`의 per-locale
 * 갈래는 여전히 `RegExp`이고 `{locale}` N개를 인접 캡처 N개로 이어 붙인다. 예산이 두 벌이면
 * 한쪽만 조용히 열린다 — 그래서 두 갈래가 이 함수 하나를 지난다.
 */
export function exceedsGlobBudget(pathTemplate: string): boolean {
  if (pathTemplate.length > MAX_TEMPLATE_LENGTH) return true;
  return (pathTemplate.match(GLOB_QUANTIFIER)?.length ?? 0) > MAX_GLOB_QUANTIFIERS;
}

/**
 * 들여쓰기 2칸 + 파일 끝 개행 정확히 1개.
 *
 * ⚠️ **원본을 아는 호출부는 `serializeJson(value, style)`을 직접 부른다** — 이 함수는 원본이
 * 없을 때의 기본 경로다(신규 로케일 파일). 시그니처를 그대로 두는 것은 호출부 diff를 줄이려는
 * 것이고, 판정은 `lib/adapters/json-style.ts` 한 곳에 있다.
 */
export function serialize(value: unknown): string {
  return serializeJson(value);
}

/**
 * 낼 항목을 고르고 **원본 파일 순서로** 늘어놓는다.
 *
 * 빈 문자열도 미번역으로 취급한다(편집 UI에서 값을 지우면 그렇게 들어온다). 미번역 항목을
 * 남기면 그 값이 그대로 렌더되는데, 빼면 폴백한다.
 *
 * 정렬은 두 층이다 (`docs/features/key-order-preservation/`):
 *
 * 1. `order`가 있는 것 먼저, `order` 오름차순 — 그 파일에서의 위치다.
 * 2. 없는 것은 뒤에, 코드 유닛 순. 순서를 모르는 키이고 개정 전 규칙이 그대로 폴백이 된다.
 *
 * ⚠️ **동률은 키로 갈라 전순서를 만든다.** 배열 위치로 갈리게 두면 DB 조회 순서가 바이트에
 * 새어 `같은 DB 상태 → 같은 바이트`가 환경(컬레이션·행 순서)에 묶인다 — blob SHA 비교 전체가
 * 그 불변식 위에 서 있다 (ARCHITECTURE §1.1·§2).
 *
 * ⚠️ **`order`를 `if (e.order)`로 보지 않는다.** 0이 falsy라 파일의 첫 키가 맨 뒤로 밀린다.
 */
export function orderedEntries(entries: readonly LocaleEntry[]): LocaleEntry[] {
  return entries
    // orphaned = 코드에서 사라진 키. DB엔 남기고 파일에서만 뺀다 — 되돌릴 수 있어야 한다.
    // **모든 재생성 writer가 이 함수를 지나야 이 불변식에 주인이 생긴다.**
    .filter((e) => e.orphaned !== true)
    .filter((e) => e.message !== "")
    // `filter`가 이미 새 배열을 냈으므로 `sort`가 입력을 건드리지 않는다.
    .sort((a, b) => {
      const ao = a.order;
      const bo = b.order;
      if (ao !== undefined && bo !== undefined) return ao - bo || compareKeys(a.key, b.key);
      // 있는 쪽이 무조건 앞이다 — 크기 비교가 아니라 두 층이라서 order 999도 order 없음보다 앞이다.
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return compareKeys(a.key, b.key);
    });
}

/**
 * 로케일 코드로 보이는 파일/디렉터리 이름인가. `zh-CN` 같은 지역 서브태그를 포함한다.
 *
 * ⚠️ **camelCase 형태(`koKR`·`enUS`·`zhCN`)도 받는다** (2026-09-02 추가). naive-ui가 로케일 파일을
 * `src/locales/common/koKR.ts`로 두는데, 구분자가 없어서 전에는 로케일로 인식되지 않아 리포 전체가
 * 탐지에서 빠졌다. 정확히 `소문자2 + 대문자2`만 받으므로 일반 식별자와 섞일 여지가 좁다.
 */
export function looksLikeLocale(name: string): boolean {
  return /^[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/.test(name) || /^[a-z]{2}[A-Z]{2}$/.test(name);
}

/**
 * **우연히 일치할 여지가 좁은** 로케일 코드인가 — 2글자, 지역 서브태그가 붙은 것, camelCase.
 *
 * ⚠️ **맨 3글자는 여기서 빠진다.** `looksLikeLocale`이 `[a-z]{2,3}`을 받는데 3글자 영단어와
 * 정면으로 충돌한다: 홀드아웃 20개에서 오탐 2건이 정확히 그것이었다 (2026-09-02 3차) —
 * grafana의 `azuremonitor/dashboards/{adx,arg}.json`(대시보드 정의)과 n8n의
 * `__schema__/…/issueAttachment/{add,get}.json`(JSON 스키마)이 1순위 후보로 올라왔다. `adx`·`arg`·
 * `add`·`get`은 전부 `[a-z]{3}`이다.
 *
 * 3글자 로케일(`fil`·`ceb`·`haw`)을 버리자는 게 아니다 — `hasStrongLocale`이 **같은 그룹에 강한
 * 코드가 하나라도 있을 것**만 요구한다. 실제 카탈로그는 거의 항상 `en` 옆에 있고, 우연히 모인
 * 3글자 영단어 디렉터리에는 그게 없다.
 */
export function strongLocale(name: string): boolean {
  return (
    /^[a-z]{2}(?:[-_][A-Za-z]{2,4})?$/.test(name) ||
    /^[a-z]{2}[A-Z]{2}$/.test(name) ||
    /^[a-z]{3}[-_][A-Za-z]{2,4}$/.test(name)
  );
}

/** 후보 그룹이 로케일 모음인가. **모든 어댑터의 그룹 필터가 이걸 통과해야 한다.** */
export function hasStrongLocale(locales: Iterable<string>): boolean {
  for (const name of locales) if (strongLocale(name)) return true;
  return false;
}

/**
 * `client.bs_BA` → `{ prefix: "client.", locale: "bs_BA" }`. 접두사가 없으면 `undefined`.
 *
 * 파일명 전체가 로케일인 형태(`en.json`)만 보던 탐지가 홀드아웃 3개를 놓쳤다: discourse
 * `config/locales/client.ar.yml`, gitea `options/locale/locale_de-DE.json`, jitsi
 * `lang/main-af.json`. 구분자는 `.`·`-`·`_` 셋이다.
 *
 * **오른쪽 구분자부터 시도한다.** `client.bs_BA`는 마지막 `_`에서 자르면 `BA`(대문자라 탈락)이고
 * 그다음 `.`에서 `bs_BA`가 나온다 — 왼쪽부터 자르면 `bs_BA`를 `_`로 다시 쪼개게 된다.
 */
export function splitLocaleSuffix(base: string): { prefix: string; locale: string } | undefined {
  for (let i = base.length - 1; i > 0; i -= 1) {
    const ch = base[i];
    if (ch !== "." && ch !== "-" && ch !== "_") continue;
    const locale = base.slice(i + 1);
    if (locale !== "" && looksLikeLocale(locale)) return { prefix: base.slice(0, i + 1), locale };
  }
  return undefined;
}

/** 경로에 i18n 계열 이름이 있는가 — `rankCandidates`의 신호 하나. */
export const I18N_HINT = /(^|\/)(i18n|locale|locales|lang|langs|messages|translation|translations)(\/|$)/i;

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

/** 경로에서 읽어내는 순위 신호. 어댑터 내부와 어댑터 간 순위가 **같은 신호**를 쓴다. */
export function pathSignals(path: string): { hint: boolean; aside: boolean; depth: number } {
  const dir = path.slice(0, Math.max(0, path.lastIndexOf("/")));
  return {
    hint: I18N_HINT.test(path),
    aside: ASIDE_HINT.test(path),
    // 얕은 쪽이 진짜일 가능성이 높다 — `locale/`이 `locale/article/`보다 앞이다.
    depth: dir === "" ? 0 : dir.split("/").length,
  };
}

/**
 * 후보 순위 결정. **경로 사전순으로 고르면 안 된다** — bugshot-web에서 `public/search/{locale}.json`
 * (검색 인덱스, 최상위가 배열)이 `src/lib/i18n/{locale}.json`보다 먼저 잡혔다.
 *
 * 신호 둘을 쓴다: 경로에 i18n 계열 이름이 있는가(`I18N_HINT`), 로케일이 몇 개인가.
 */
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

/**
 * `{locale}`이 경로에서 어떤 모양으로 들어가는가. **작을수록 앞이다.**
 *
 * 다른 신호가 다 같을 때 **맨 로케일 파일이 접두사 붙은 것을 이겨야 한다.** rubygems.org에서
 * `config/locales/avo.{locale}.yml`(Avo 관리자 UI 9로케일)이 `config/locales/{locale}.yml`
 * (앱 9로케일)을 이겼다 — 로케일 수·깊이가 같아 마지막 tiebreak인 경로 사전순으로 갔고
 * `a` < `{`였다 (2026-09-02 3차 실측). 접두사는 "이 카탈로그의 한 조각"을 뜻하므로 맨 형태가
 * 정본일 가능성이 높다.
 *
 * ⚠️ **로케일 수보다 뒤에 둔다.** 앞에 두면 discourse의 `themes/foundation/locales/{locale}.yml`
 * (49로케일 · **1키**)이 진짜 `config/locales/client.{locale}.yml`을 이긴다.
 */
export function templateShapeRank(pathTemplate: string): number {
  const at = pathTemplate.lastIndexOf("/");
  const base = at === -1 ? pathTemplate : pathTemplate.slice(at + 1);
  if (/^\{locale\}\.[^.]+$/.test(base)) return 0;
  if (pathTemplate.includes("/{locale}/") || pathTemplate.startsWith("{locale}/")) return 1;
  return 2;
}

/** 후보 순위 비교 — 어댑터 내부와 어댑터 간이 **같은 함수**를 쓴다. */
export function compareTemplates(
  a: { pathTemplate: string; localeCount: number },
  b: { pathTemplate: string; localeCount: number },
): number {
  const sa = pathSignals(a.pathTemplate);
  const sb = pathSignals(b.pathTemplate);
  if (sa.hint !== sb.hint) return sa.hint ? -1 : 1;
  if (sa.aside !== sb.aside) return sa.aside ? 1 : -1;
  if (a.localeCount !== b.localeCount) return b.localeCount - a.localeCount;
  const shape = templateShapeRank(a.pathTemplate) - templateShapeRank(b.pathTemplate);
  if (shape !== 0) return shape;
  if (sa.depth !== sb.depth) return sa.depth - sb.depth;
  return compareKeys(a.pathTemplate, b.pathTemplate);
}

/**
 * `rankCandidates`와 같은 축인데 **키가 `pathTemplate`이다.**
 *
 * 한 디렉터리에서 모양이 다른 후보가 여러 개 나올 수 있게 되면서(맨 로케일 파일 / 접두사 붙은
 * 파일명 / 로케일 디렉터리) `dir`로는 마지막 tiebreak이 무승부가 되고 순서가 **삽입 순서에**
 * 달린다 — 결정성이 곧 순위의 전제라 여기서만 갈라 쓴다. `depth`도 이쪽만 본다.
 */
export function rankTemplateCandidates<T extends { pathTemplate: string; locales: Set<string> }>(
  candidates: readonly T[],
): T[] {
  return liftAncestors(
    candidates
      .slice()
      .sort((a, b) =>
        compareTemplates(
          { pathTemplate: a.pathTemplate, localeCount: a.locales.size },
          { pathTemplate: b.pathTemplate, localeCount: b.locales.size },
        ),
      ),
  );
}

/** 템플릿이 든 디렉터리 (끝에 `/` 포함). 최상위면 빈 문자열. */
function dirOf(pathTemplate: string): string {
  const at = pathTemplate.lastIndexOf("/");
  return at === -1 ? "" : pathTemplate.slice(0, at + 1);
}

/**
 * 1순위의 **조상 디렉터리**에 있는 후보를 앞으로 끌어올린다.
 *
 * 카탈로그가 디렉터리 트리에서 조상에 있으면 그게 정본이고 자손은 그 하위 조각이다 —
 * DMPRoadmap/roadmap이 `config/locales/contact_us/contact_us.{locale}.yml`(17로케일 · **11키**)로
 * `config/locales/{locale}.yml`(15로케일)을 눌렀다. 접두사 형태를 받으면서 생긴 회귀고,
 * 로케일 수가 실제로 더 많아서 그 신호로는 뒤집히지 않는다 (2026-09-02 3차).
 *
 * ⚠️ **비교 함수에 넣지 않는다.** "조상이 이긴다"는 추이적이지 않아서(A는 B의 조상, B는 C보다
 * 로케일이 많음, C는 A의 조상 아님) `sort`에 넣으면 결과가 구현 정의가 된다. 정렬이 끝난 뒤
 * 안정적으로 끌어올리는 편이 결정적이다. 승격할 때마다 head의 디렉터리가 짧아지므로 끝난다.
 *
 * ⚠️ **버킷 안에서만 쓴다** — 어댑터 안(`rankTemplateCandidates`)과 `index.ts`의 비크롬 버킷(`rest`).
 * 크롬 버킷을 가로질러 적용하면 SchizoDuckie/DuckieTV의 `_locales/{locale}.json`(json-catalog,
 * 조상)이 `_locales/{locale}/messages.json`(정답)을 끌어내린다 — 크롬 최우선 규칙이 막고 있는
 * 것을 여기서 되살릴 이유가 없다 (ARCHITECTURE §1.3 "버킷별로 적용").
 */
export function liftAncestors<T extends { pathTemplate: string }>(ranked: readonly T[]): T[] {
  const out = ranked.slice();
  for (let i = 1; i < out.length; i += 1) {
    const head = out[0];
    const at = out[i];
    if (head === undefined || at === undefined) continue;
    const headDir = dirOf(head.pathTemplate);
    const dir = dirOf(at.pathTemplate);
    if (dir.length < headDir.length && headDir.startsWith(dir)) {
      out.splice(i, 1);
      out.unshift(at);
      i = 0;
    }
  }
  return out;
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

/**
 * 두 `read` 결과의 **의미**(로케일 × 키 → 값)가 같은가. 순서·표현은 보지 않는다.
 *
 * survey의 왕복 게이트와 `pnpm ingest`의 왕복 게이트가 **같은 함수**를 쓴다 — ingest가 자체
 * `stableJson`(JSON.parse 고정)을 들고 있어 YAML·code-dict에서 SyntaxError로 죽고 ts-dict는
 * 검증을 조용히 건너뛰었다 (2026-09-04 audit #8).
 *
 * @param dropEmpty 재생성 writer는 미번역(빈 값)을 빼므로 그 규칙을 양쪽에 적용해야 공정하다.
 *   축은 `writeStrategy`다.
 */
export function sameMeaning(a: ReadResult, b: ReadResult, dropEmpty: boolean): boolean {
  const shape = (r: ReadResult) => {
    const m = new Map<string, Map<string, string>>();
    for (const loc of r.locales) {
      const inner = new Map<string, string>();
      for (const e of loc.entries) {
        if (dropEmpty && e.message === "") continue;
        inner.set(e.key, e.message);
      }
      if (inner.size > 0) m.set(loc.locale, inner);
    }
    return m;
  };
  const x = shape(a);
  const y = shape(b);
  if (x.size !== y.size) return false;
  for (const [locale, inner] of x) {
    const other = y.get(locale);
    if (other === undefined || other.size !== inner.size) return false;
    for (const [key, value] of inner) if (other.get(key) !== value) return false;
  }
  return true;
}
