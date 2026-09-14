import { chromeLocales } from "./chrome-locales";
import { codeDict } from "./code-dict";
import { jsonCatalog } from "./json-catalog";
import { tsDict } from "./ts-dict";
import { yamlCatalog } from "./yaml-catalog";
import { compareTemplates, liftAncestors, pathSignals } from "./shared";
import type { Adapter, AdapterName, DetectedFormat, FileProbe } from "./types";

export { chromeLocales } from "./chrome-locales";
export { jsonCatalog } from "./json-catalog";
export { yamlCatalog } from "./yaml-catalog";
export { codeDict } from "./code-dict";
export { tsDict } from "./ts-dict";
export { localeFromPath } from "./chrome-locales";
export { namespaceOf, compareKeys, catalogVerdict, matchGlobPaths, pathSignals } from "./shared";
export * from "./types";

/**
 * 등록된 어댑터. ⚠️ **배열 순서는 우선순위가 아니다** — 후보 순위는 `detectCandidatesAcross`가
 * 어댑터를 가로질러 정한다(아래). 전에는 첫 매치 승이라 이 순서가 곧 우선순위였고, 그 서술이
 * 2026-09-02 이후로도 남아 있었다 (2026-09-04 audit #39).
 *
 * JSON을 YAML·코드보다 앞에 두는 이유: 한 리포에 둘이 공존하면(mastodon이 프런트엔드 JSON +
 * Rails YAML을 둘 다 갖는다) **재생성 어댑터가 다루기 쉬운 쪽**이고, 실측에서 그쪽이 앱 UI였다.
 *
 * ⚠️ **`ts-dict`도 2026-09-14부터 자동 탐지에 참여한다** (ARCHITECTURE §1.9 판정 ③ 뒤집기).
 * 단 **경로만으로는 후보를 못 낸다** — 내용을 봐야 알 수 있어서, 1패스에서 내려받을 파일을 고르는
 * `tsDictProbePaths`가 그 자리를 맡는다.
 */
export const ADAPTERS: readonly Adapter[] = [chromeLocales, jsonCatalog, yamlCatalog, codeDict, tsDict];

/**
 * ⚠️ **한 리포에 로케일 포맷이 둘 이상일 수 있다.** bugshot-2가 그렇다 — `_locales`(4키,
 * manifest·스토어 메타데이터)와 `ts-dict`(903키, 앱 UI)가 공존한다. 위 우선순위는 기본값일
 * 뿐이고 규모가 큰 쪽을 놓칠 수 있으므로 **명시 지정이 이긴다**(`--adapter`, `Project.adapterName`).
 *
 * 한 프로젝트가 두 표면을 동시에 다루는 것은 비범위다 — `Project`가 어댑터를 하나만 들고,
 * 필요해지면 표면마다 프로젝트를 나눈다 (PRODUCT §4.2).
 */
export function detectFormatWith(
  name: AdapterName,
  paths: readonly string[],
  probe?: FileProbe,
): DetectedFormat | undefined {
  return ADAPTERS.find((a) => a.name === name)?.detect(paths, probe);
}

/**
 * 모든 어댑터의 후보를 모아 **하나의 순위 목록**으로 만든다.
 *
 * ⚠️ **고정 `ADAPTERS` 순서로 고르면 안 된다** (2026-09-02 실측 발견). 전에는 첫 매치 승이라
 * 어댑터 **내** 순위 규칙(i18n 신호·예제 감점·로케일 수)이 어댑터 **간**에는 전혀 작동하지 않았다:
 *
 * - GSA/search-gov — `spec/fixtures/json/…/{locale}.json`(2로케일)이 `config/locales/{locale}.yml`
 *   (65로케일)을 이겼다. json이 yaml보다 앞이라는 이유만으로.
 * - ant-design·vuetify·payload — 문서·예제 JSON이 진짜 코드 딕셔너리(73·43·40로케일)를 이겼다.
 *
 * **`chrome-locales`만 예외로 최우선이다.** 크롬 확장은 `_locales`가 실제 배포 산출물이고 옆에
 * 무엇이 있어도 브라우저가 읽는 건 그것뿐이다. 단 **예제 디렉터리 안의 `_locales`는 예외가
 * 아니다** — lokalise/i18n-ally가 정확히 그 형태로 오탐이 났다.
 */
export function detectCandidatesAcross(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  const all = ADAPTERS.flatMap((a) => a.detectCandidates(paths, probe));
  const chromeFirst: DetectedFormat[] = [];
  const rest: DetectedFormat[] = [];
  for (const c of all) {
    const { aside } = pathSignals(c.pathTemplate);
    if (c.adapter === "chrome-locales" && !aside) chromeFirst.push(c);
    else rest.push(c);
  }
  return [...rankTemplates(chromeFirst), ...rankTemplates(rest)];
}

/**
 * i18n 신호 → 예제 감점 → 로케일 수 → 경로 모양 → 얕은 경로 → 경로순.
 *
 * **어댑터 내부(`rankTemplateCandidates`)와 같은 함수를 쓴다** — 축이 갈리면 어댑터 안에서 1순위인
 * 후보가 어댑터 간 순위에서 뒤집히고, 그 차이가 어디서 났는지 아무도 못 짚는다.
 *
 * ⚠️ **이 함수는 어댑터가 매긴 순서를 전부 버리고 다시 정렬한다.** 그래서 `liftAncestors`를
 * 어댑터 안에만 두면 무효다 — DMPRoadmap/roadmap이 그 상태로 여전히 오탐이었다. 버킷별로
 * 적용하므로 크롬 최우선은 그대로다(크롬 후보는 애초에 다른 버킷이다).
 */
function rankTemplates(candidates: readonly DetectedFormat[]): DetectedFormat[] {
  return liftAncestors(
    candidates
      .slice()
      .sort((a, b) =>
        compareTemplates(
          { pathTemplate: a.pathTemplate, localeCount: a.locales.length },
          { pathTemplate: b.pathTemplate, localeCount: b.locales.length },
        ),
      ),
  );
}

/** 리포 파일 경로 목록에서 로케일 포맷을 찾는다. 못 찾으면 undefined — 연동 불가다. */
export function detectFormat(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidatesAcross(paths, probe)[0];
}

/**
 * 문자열이 등록된 어댑터 이름인가. `Project.adapterName`은 문자열 컬럼이고 CLI `--adapter`는 사용자
 * 입력이라 둘 다 여기를 지나야 `adapterFor`가 나중에 터지지 않는다 — 전에는 CLI가 `as never`로
 * 우회해 오타가 "해당 포맷을 찾지 못했다"(미탐지)와 같은 메시지로 떨어졌다.
 */
export function isAdapterName(name: string): name is AdapterName {
  return ADAPTERS.some((a) => a.name === name);
}

export function adapterFor(format: DetectedFormat): Adapter {
  const found = ADAPTERS.find((a) => a.name === format.adapter);
  if (!found) throw new Error(`unregistered adapter: ${format.adapter}`);
  return found;
}
