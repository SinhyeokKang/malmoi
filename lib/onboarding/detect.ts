import { adapterFor } from "@/lib/adapters";
import { tsDictProbePaths } from "@/lib/adapters/ts-dict";
import { compareKeys, sampleOrder } from "@/lib/adapters/shared";
import type { Adapter, AdapterName, DetectedFormat, FileProbe, LocaleEntry, ReadLocale } from "@/lib/adapters/types";
import { m } from "@/lib/i18n";
import { pickBaseLocale, selectLocaleFiles } from "@/lib/push/payload";

/**
 * ⚠️ **`keyGap`은 잎 모듈에 산다** — ③(클라이언트)이 그것을 **값으로** 부르는데, 이 파일은
 * `lib/adapters`를 물어 ts-morph 전체를 끌고 온다 (POSTMORTEM 2026-09-07, 7.2MB). 여기서
 * 다시 내보내는 것은 서버 호출부의 import 자리를 바꾸지 않기 위해서다.
 */
export { keyGap } from "./key-gap";

/**
 * 2패스 탐지의 순수 조각들 (ARCHITECTURE §3.1). `FileProbe`가 동기라 서버는 경로만으로 1차 후보를
 * 얻고, 내려받을 파일을 고른 뒤, 내용을 들고 다시 돈다. 여기에는 I/O가 없다 — GitHub은 Server Action이 부른다.
 */

/** 후보 그룹의 공통 모양 — `DetectedFormat`(locales 배열)과 `CodeDictGroup`(locales Set)을 둘 다 받는다. */
export type TemplateGroup = { pathTemplate: string; locales: Iterable<string> };

/**
 * 내려받을 후보 수 상한. 비용이 아니라 **응답 시간**이다 — 페이지 `maxDuration`이 60초다 (ARCHITECTURE §3.1).
 * JSON류 5 × 3파일 + code-dict 2 × 3파일 + **ts-dict 씨앗 2 × 8파일**(2026-09-14) = blob ≤ 37.
 * ⚠️ **다운로드가 순차다**(secondary rate limit) — 늘린 몫이 그대로 응답 시간이다.
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
  /**
   * 리포 경로 **전체** (2026-09-14). ⚠️ **앞의 둘과 성격이 다르다** — 그쪽은 1패스가 만든 후보
   * 그룹인데 `ts-dict`는 내용을 봐야 알 수 있어 1패스 후보가 0이다. 그래서 경로를 직접 받아
   * 씨앗을 고른다.
   *
   * ⚠️ **기본값을 두지 않는다** (2026-09-14 2차 리뷰). `= []`로 두면 안 넘긴 호출부가 **조용히**
   * 통과하고 그 경로에서만 ts-dict가 영영 안 뜬다 — 실제로 `scripts/smoke-github.ts`가 그 상태였다.
   * 필수 인자면 컴파일러가 잡는다. 후보가 없는 호출은 `[]`를 **명시적으로** 넘긴다.
   */
  repoPaths: readonly string[],
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
  for (const path of tsDictProbePaths(repoPaths)) out.add(path);
  return [...out];
}

/** 내려받은 blob을 어댑터가 받는 동기 probe로. 없는 경로는 `undefined`다 — 어댑터가 그것을 "미검증"으로 읽는다. */
export function makeProbe(blobs: ReadonlyMap<string, string>): FileProbe {
  return (path) => blobs.get(path);
}

/**
 * 어댑터 이름 → 화면 문구 + 경로 예시 (DESIGN §6.7). **어댑터 이름은 화면에 쓰지 않는다** (PRODUCT §3) — 단 경로는
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
  /** 전체 snapshot에서 계산한 출력 경로. 표본 미리보기와 독립이다. */
  outputPaths: string[];
  /** 서버가 재검증한 포맷의 서명. 순수 요약에는 없고 Action이 발급한다. */
  confirmation?: string;
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
  /** 기본 선택 — 사용자가 라디오로 바꾼다 (PRODUCT §7.3). */
  baseLocale: string;
  keys: KeyCount;
  /**
   * ②의 키·값 미리보기. **`sampleOrder`가 고른 로케일만 든다 — 추가 blob이 0이다** (ARCHITECTURE §3.1):
   * `probeTargets`가 이미 그 파일들을 내려받았고, 지금까지는 기준 로케일 하나만 풀고 나머지를 버렸다.
   * 나머지 로케일은 사용자가 세그먼트를 누를 때 `loadCandidateSample`이 받는다.
   *
   * ⚠️ **multi-locale(`ts-dict`)만 예외로 처음부터 전 언어를 든다** — 한 파일에 전 언어가 있어
   * read 한 번이 전부를 주므로 공짜다.
   */
  samples: LocaleSample[];
};

export type SampleRow = { key: string; value: string };

export type LocaleSample = {
  locale: string;
  /** 앞 `SAMPLE_ROWS`개. `adapter.read`가 준 순서 그대로다 — 여기서 다시 정렬하지 않는다. */
  rows: SampleRow[];
  /** 그 로케일의 전체 엔트리 수. 표 바닥의 "N more keys"와 `Select` 옵션 라벨이 쓴다. */
  total: number;
};

/** 표가 언어당 보이는 행 수. 화면은 `total - rows.length`로 "N more keys"를 만든다. */
export const SAMPLE_ROWS = 10;

/**
 * 한 로케일의 앞 N행 + 전체 수.
 *
 * ⚠️ **`read`가 준 순서를 다시 정렬하지 않는다.** 어댑터가 이미 키 기준으로 정렬해 주므로 언어를
 * 바꿔도 같은 키가 같은 줄에 서고, 그것이 ②가 "ko 열이 비어 있다"를 보여 주는 화면인 이유다 (DESIGN §6.7).
 *
 * 읽기 실패는 `{ rows: [], total: 0 }`이다 — **"정말 비었다"와 구별하지 않는다.** 그 구별은 호출부가
 * 한다(빈 칸 vs "We couldn't read this file." — DESIGN §6.7): 여기는 순수 함수라 "왜 비었는지"를
 * 아는 자리가 아니고, 어느 쪽이든 후보를 떨어뜨리지 않는 것이 규칙이다 (ARCHITECTURE §4).
 */
export function sampleRows(
  adapter: Adapter,
  format: DetectedFormat,
  locale: string,
  blobs: ReadonlyMap<string, string>,
  limit: number = SAMPLE_ROWS,
): { rows: SampleRow[]; total: number } {
  return rowsOf(entriesOf(readLocales(adapter, format, blobs, locale), locale), limit);
}

/**
 * 후보 + 내려받은 blob → 사용자 언어 요약. 키 수는 기준 로케일 파일을 **실제로 read한** 결과다 — 경로와
 * 로케일 수만으로는 `_locales`(4키)와 `ts-dict`(903키)를 사람이 구별할 수 없다 (PRODUCT §7.3).
 *
 * 읽기 실패는 후보를 떨어뜨리지 않고 `key-count-failed`다 — 남의 리포를 우리 파서 규칙으로 탈락시키지 않는다
 * (ARCHITECTURE §4의 연장). 순서는 바꾸지 않는다 — 후보 순위는 탐지기 순위다 (PRODUCT §7.3).
 */
export function summarizeCandidates(
  candidates: readonly DetectedFormat[],
  blobs: ReadonlyMap<string, string>,
): Omit<CandidateSummary, "outputPaths">[] {
  const out: Omit<CandidateSummary, "outputPaths">[] = [];
  for (const c of candidates) {
    // 탐지는 로케일 2개 이상만 후보로 내므로 여기 걸리는 것은 없다 — 타입을 닫기 위한 분기다.
    const baseLocale = pickBaseLocale(c.locales);
    if (baseLocale === undefined) continue;
    const adapter = adapterFor(c);
    const { label } = formatLabel(c.adapter);
    const locales = c.locales.slice().sort(compareKeys);
    const { samples, keys } = sampleCandidate(adapter, c, locales, baseLocale, blobs);
    out.push({ adapter: c.adapter, label, pathTemplate: c.pathTemplate, locales, baseLocale, keys, samples });
  }
  return out;
}

/**
 * 한 후보의 미리보기와 키 수를 **같은 read에서** 얻는다.
 *
 * ⚠️ **`adapter.read` 호출 수가 이 함수의 예산이다.** 다운로드는 `probeTargets`가 이미 다 했으므로 여기서
 * 늘어나는 것은 blob이 아니라 **파싱**이고, `ts-dict`는 호출 하나가 ts-morph 한 바퀴다. per-locale은
 * `sampleOrder`가 고른 만큼(≤3), multi-locale은 **한 번**이다 — 한 파일에 전 언어가 있어 read 하나가
 * 전부를 준다. 로케일 수만큼 부르면 903키 파일을 50번 파싱하고 `maxDuration`(60초)을 넘긴다.
 *
 * **내려받지 않은 로케일은 `samples`에 아예 넣지 않는다** — 빈 행으로 넣으면 화면이 "정말 비었다"와
 * 구별할 수 없다. 내려받았는데 못 읽은 것만 `rows: []`로 남는다 (DESIGN §6.7).
 */
function sampleCandidate(
  adapter: Adapter,
  format: DetectedFormat,
  locales: readonly string[],
  baseLocale: string,
  blobs: ReadonlyMap<string, string>,
): { samples: LocaleSample[]; keys: KeyCount } {
  const samples: LocaleSample[] = [];
  let baseEntries: LocaleEntry[] | undefined;

  if (adapter.layout === "multi-locale") {
    const read = readLocales(adapter, format, blobs, baseLocale);
    if (read !== undefined) {
      for (const locale of locales) samples.push({ locale, ...rowsOf(entriesOf(read, locale), SAMPLE_ROWS) });
      baseEntries = entriesOf(read, baseLocale);
    }
  } else {
    for (const locale of sampleOrder(new Set(locales))) {
      const read = readLocales(adapter, format, blobs, locale);
      if (read === undefined) continue;
      const entries = entriesOf(read, locale);
      samples.push({ locale, ...rowsOf(entries, SAMPLE_ROWS) });
      if (locale === baseLocale) baseEntries = entries;
    }
  }

  return {
    samples,
    keys: baseEntries === undefined ? { status: "key-count-failed" } : { status: "counted", count: baseEntries.length },
  };
}

/**
 * 어댑터에게 파일을 먹여 로케일을 푼다. 세 결과가 다른 뜻이다:
 * `undefined`는 **내려받지 않았다**(먹일 파일이 없다), `[]`는 **읽다 던졌다**, 그 외는 읽은 결과다.
 *
 * per-locale은 `locales`를 하나로 좁혀 `selectLocaleFiles`의 같은 선택 규칙을 지난다
 * (규칙을 두 벌 만들지 않는다 — POSTMORTEM 2026-09-02). multi-locale은 글롭이라 좁히지 않는다.
 */
function readLocales(
  adapter: Adapter,
  format: DetectedFormat,
  blobs: ReadonlyMap<string, string>,
  locale: string,
): ReadLocale[] | undefined {
  const narrowed = adapter.layout === "per-locale" ? { ...format, locales: [locale] } : format;
  const files = selectLocaleFiles(adapter.layout, narrowed, [...blobs.keys()], makeProbe(blobs));
  if (files.length === 0) return undefined;
  try {
    return adapter.read(narrowed, files).locales;
  } catch {
    // read가 던지는 파일도 후보를 떨어뜨리지 않는다 — 남의 리포를 우리 파서 규칙으로 탈락시키지 않는다.
    return [];
  }
}

function entriesOf(read: readonly ReadLocale[] | undefined, locale: string): LocaleEntry[] | undefined {
  return read?.find((l) => l.locale === locale)?.entries;
}

function rowsOf(entries: readonly LocaleEntry[] | undefined, limit: number): { rows: SampleRow[]; total: number } {
  if (entries === undefined) return { rows: [], total: 0 };
  return {
    rows: entries.slice(0, limit).map((e) => ({ key: e.key, value: e.message })),
    total: entries.length,
  };
}

/**
 * 첫 적재가 내려받을 로케일 파일 경로 **전부** (ARCHITECTURE §3.1). `probeTargets`의 21개와 별개 예산이다 — 50로케일이면
 * 50개이고, 그래서 첫 적재가 별도 Action이다.
 *
 * `selectLocaleFiles`를 그대로 지난다 — 규칙이 갈리면 여기서 적재한 파일을 pull이 안 쓴다 (2026-09-04).
 * 내용 없는 probe로 경로만 뽑는다.
 */
export function ingestTargets(format: DetectedFormat, layout: Adapter["layout"], paths: readonly string[]): string[] {
  return selectLocaleFiles(layout, format, paths, () => undefined)
    .map((f) => f.path)
    .sort(compareKeys);
}
