import { adapterFor } from "@/lib/adapters";
import { compareKeys, sampleOrder } from "@/lib/adapters/shared";
import type { Adapter, AdapterName, DetectedFormat, FileProbe } from "@/lib/adapters/types";
import { m } from "@/lib/i18n";
import { pickBaseLocale, selectLocaleFiles } from "@/lib/push/payload";

/**
 * 2패스 탐지의 순수 조각들 (design §3.1·§3.2·§3.3·§4). `FileProbe`가 동기라 서버는 경로만으로 1차 후보를
 * 얻고, 내려받을 파일을 고른 뒤, 내용을 들고 다시 돈다. 여기에는 I/O가 없다 — GitHub은 Server Action이 부른다.
 */

/** 후보 그룹의 공통 모양 — `DetectedFormat`(locales 배열)과 `CodeDictGroup`(locales Set)을 둘 다 받는다. */
export type TemplateGroup = { pathTemplate: string; locales: Iterable<string> };

/**
 * 내려받을 후보 수 상한. 비용이 아니라 **응답 시간**이다 — 페이지 `maxDuration`이 60초다 (design §2).
 * JSON류 5 × 3파일 + code-dict 2 × 3파일 = blob ≤ 21.
 */
export const PROBE_LIMITS = { jsonLike: 5, codeDict: 2 } as const;

/**
 * 후보 → 내려받을 blob 경로.
 *
 * ⚠️ **여기서 고르는 파일은 재탐지가 읽을 파일과 바이트 단위로 같아야 한다.** `verifySamples`·`hasDictionary`가
 * `sampleOrder(locales)`(en 우선 → 코드포인트 순, 3개)를 읽는다. 다른 3개를 받으면 후보가 검증 실패가 아니라
 * **미검증으로 통째로 떨어진다** — 그래서 `sampleOrder`를 import해 쓴다.
 */
export function probeTargets(
  jsonLike: readonly TemplateGroup[],
  codeDict: readonly TemplateGroup[],
  limits: { jsonLike: number; codeDict: number } = PROBE_LIMITS,
): string[] {
  const out = new Set<string>();
  const take = (groups: readonly TemplateGroup[], limit: number): void => {
    for (const g of groups.slice(0, limit)) {
      for (const locale of sampleOrder(new Set(g.locales))) out.add(g.pathTemplate.replaceAll("{locale}", locale));
    }
  };
  take(jsonLike, limits.jsonLike);
  take(codeDict, limits.codeDict);
  return [...out];
}

/** 내려받은 blob을 어댑터가 받는 동기 probe로. 없는 경로는 `undefined`다 — 어댑터가 그것을 "미검증"으로 읽는다. */
export function makeProbe(blobs: ReadonlyMap<string, string>): FileProbe {
  return (path) => blobs.get(path);
}

/**
 * 어댑터 이름 → 화면 문구 + 경로 예시 (design §3.3). **어댑터 이름은 화면에 쓰지 않는다** (SAAS §3) — 단 경로는
 * 보인다. 사용자가 자기 리포에서 확인할 수 있는 유일한 단서라서 숨기면 후보를 고를 근거가 사라진다.
 * "코드 딕셔너리"가 둘이라 경로 예시가 구별자다.
 */
const FORMATS = m.newProject.formats satisfies Record<AdapterName, { label: string; example: string }>;

export function formatLabel(adapter: AdapterName): { label: string; example: string } {
  // 어댑터를 추가하면 사전에 키가 없어 여기서 컴파일 에러가 난다 — 전 `never` 검사와 같은 힘이다.
  return FORMATS[adapter];
}

export type KeyCount = { status: "counted"; count: number } | { status: "key-count-failed" };

export type CandidateSummary = {
  /** 확정 시 되돌려 보내는 값이다 — 화면에 쓰지 않는다. */
  adapter: AdapterName;
  label: string;
  /**
   * ⚠️ **`formatLabel`의 `example`은 여기 없다** (2026-09-07 리뷰 ⚪11). 후보는 **자기 실제
   * `pathTemplate`** 을 보이므로 형식 예시가 중복이고, 계산해서 아무도 안 쓰면 "만든 것이 실제로
   * 호출되는가"를 흐린다. 예시는 수동 지정 셀렉트(`AdapterChoice`)에서만 쓰인다.
   */
  pathTemplate: string;
  /** 정렬돼 있다 — 탐지 결과는 정렬돼 있지 않다. */
  locales: string[];
  /** 기본 선택 — 사용자가 라디오로 바꾼다 (design §3.2). */
  baseLocale: string;
  keys: KeyCount;
};

/**
 * 후보 + 내려받은 blob → 사용자 언어 요약. 키 수는 기준 로케일 파일을 **실제로 read한** 결과다 — 경로와
 * 로케일 수만으로는 `_locales`(4키)와 `ts-dict`(903키)를 사람이 구별할 수 없다 (design §3.2).
 *
 * 읽기 실패는 후보를 떨어뜨리지 않고 `key-count-failed`다 — 남의 리포를 우리 파서 규칙으로 탈락시키지 않는다
 * (ARCHITECTURE §4의 연장). 순서는 바꾸지 않는다 — 후보 순위는 탐지기 순위다 (spec §6).
 */
export function summarizeCandidates(
  candidates: readonly DetectedFormat[],
  blobs: ReadonlyMap<string, string>,
): CandidateSummary[] {
  const probe = makeProbe(blobs);
  const out: CandidateSummary[] = [];
  for (const c of candidates) {
    // 탐지는 로케일 2개 이상만 후보로 내므로 여기 걸리는 것은 없다 — 타입을 닫기 위한 분기다.
    const baseLocale = pickBaseLocale(c.locales);
    if (baseLocale === undefined) continue;
    const adapter = adapterFor(c);
    const { label } = formatLabel(c.adapter);
    out.push({
      adapter: c.adapter,
      label,
      pathTemplate: c.pathTemplate,
      locales: c.locales.slice().sort(compareKeys),
      baseLocale,
      keys: countKeys(adapter, c, baseLocale, blobs, probe),
    });
  }
  return out;
}

function countKeys(
  adapter: Adapter,
  format: DetectedFormat,
  baseLocale: string,
  blobs: ReadonlyMap<string, string>,
  probe: FileProbe,
): KeyCount {
  // 기준 로케일 파일만 읽는다 — per-locale은 locales를 base 하나로 좁혀 같은 선택 규칙을 지난다
  // (`selectLocaleFiles`를 새로 짜지 않는다 — POSTMORTEM 2026-09-02). 있는 blob은 sampleOrder의 첫 파일과
  // 같으므로(pickBaseLocale과 같은 en 우선) 항상 내려받은 것이다.
  const narrowed = adapter.layout === "per-locale" ? { ...format, locales: [baseLocale] } : format;
  const files = selectLocaleFiles(adapter.layout, narrowed, [...blobs.keys()], probe);
  if (files.length === 0) return { status: "key-count-failed" };
  try {
    const entries = adapter.read(narrowed, files).locales.find((l) => l.locale === baseLocale)?.entries;
    return entries === undefined ? { status: "key-count-failed" } : { status: "counted", count: entries.length };
  } catch {
    // read가 던지는 파일도 "키 수 확인 실패"다 — 후보 자체는 남긴다.
    return { status: "key-count-failed" };
  }
}

/**
 * 첫 적재가 내려받을 로케일 파일 경로 **전부** (design §4). `probeTargets`의 21개와 별개 예산이다 — 50로케일이면
 * 50개이고, 그래서 첫 적재가 별도 Action이다 (§3.11).
 *
 * `selectLocaleFiles`를 그대로 지난다 — 규칙이 갈리면 여기서 적재한 파일을 pull이 안 쓴다 (2026-09-04).
 * 내용 없는 probe로 경로만 뽑는다.
 */
export function ingestTargets(format: DetectedFormat, layout: Adapter["layout"], paths: readonly string[]): string[] {
  return selectLocaleFiles(layout, format, paths, () => undefined)
    .map((f) => f.path)
    .sort(compareKeys);
}
