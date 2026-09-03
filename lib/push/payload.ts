import { matchGlobPaths, namespaceOf } from "@/lib/adapters/index";
import type { Adapter, AdapterFile, DetectedFormat, FileProbe, ReadResult } from "@/lib/adapters/types";
import type { ScannedRef } from "@/lib/scan/index";

import type { PushPayloadType } from "./plan";

/**
 * `/api/push` 페이로드의 **생산자**. 전에는 `scripts/push-local.ts`의 리터럴이었고, 그래서
 * 계약이 넓어져도 컴파일러가 붙잡을 지점이 없었다 (POSTMORTEM 2026-08-31 — 필수 필드 둘이
 * 늘었는데 typecheck·test가 전부 green이었다). 순수 함수로 올려 테스트가 이 홉을 덮는다.
 *
 * **I/O가 없다** — 파일 읽기는 `probe`로 주입받고, 어댑터 실행은 호출부가 한다.
 */

/**
 * base 로케일 판정. `en`이 있으면 `en`, 없으면 사전순 첫 번째다.
 *
 * ⚠️ **리포 관례를 추정하는 것이라 정본이 아니다** (TASKS §3a의 🔒 항목). 여기를 바꾸면
 * 어느 파일의 description이 키 메타데이터가 되는지가 통째로 바뀐다.
 */
export function pickBaseLocale(locales: readonly string[]): string | undefined {
  if (locales.includes("en")) return "en";
  return locales.slice().sort()[0];
}

/**
 * 어댑터에게 먹일 파일을 고른다. **`layout`이 이 판정의 축이다** (`writeStrategy`가 아니다 —
 * 그쪽은 write에 원본이 필요한지를 정한다).
 *
 * ⚠️ **먹이지 않으면 어댑터는 없는 것과 같다.** 새 어댑터를 추가하면 이 층도 같은 커밋에서
 * 고친다 (POSTMORTEM 2026-09-02 — `yaml-catalog`가 1순위 리포 0개였던 원인이 판정이 아니라
 * 공급이었다).
 */
export function selectLocaleFiles(
  layout: Adapter["layout"],
  format: DetectedFormat,
  paths: readonly string[],
  probe: FileProbe,
): AdapterFile[] {
  if (layout === "per-locale") {
    return format.locales
      .map((l) => format.pathTemplate.replace("{locale}", l))
      // 리포에 없는 경로는 뺀다 — 빈 내용을 먹이면 어댑터가 그 로케일의 키를 통째로 잃는다.
      .filter((p) => paths.includes(p))
      .map((p) => ({ path: p, content: probe(p) ?? "" }));
  }
  // multi-locale은 pathTemplate이 글롭이라 치환하지 않는다. **pull과 같은 함수로 매칭한다** —
  // 규칙이 갈리면 여기서 적재한 파일을 pull이 안 써서 번역이 리포에 도달하지 않는다 (2026-09-04).
  return matchGlobPaths(format.pathTemplate, paths).map((p) => ({ path: p, content: probe(p) ?? "" }));
}

export type PushPayloadInput = {
  projectSlug: string;
  commitSha: string;
  /** `git show -s --format=%cI` — offset이 붙은 ISO 8601. 역행 판정의 근거다. */
  commitAt: string;
  format: DetectedFormat;
  read: ReadResult;
  baseLocale: string;
  scanRefs: readonly ScannedRef[];
};

export type BuiltPushPayload = {
  payload: PushPayloadType;
  /**
   * 로케일 파일에 없는 키를 코드가 참조한 수. **경고일 뿐 실패가 아니다** (MVP §3.1 5단계) —
   * 키의 진실은 로케일 파일이고 스캔은 사용처만 안다.
   */
  unknownRefs: number;
};

export function buildPushPayload(input: PushPayloadInput): BuiltPushPayload {
  const baseEntries = input.read.locales.find((l) => l.locale === input.baseLocale)?.entries ?? [];
  const keySet = new Set(baseEntries.map((e) => e.key));

  const refs = input.scanRefs
    .filter((r) => keySet.has(r.key))
    .flatMap((r) => r.refs.map((loc) => ({ key: r.key, path: loc.path, line: loc.line })));

  const payload: PushPayloadType = {
    projectSlug: input.projectSlug,
    commitSha: input.commitSha,
    commitAt: input.commitAt,
    format: {
      adapter: input.format.adapter,
      pathTemplate: input.format.pathTemplate,
      // detect는 이 값을 채울 수 없다 — 중첩 여부는 내용의 성질이라 read가 관측한다.
      nested: input.read.nested,
      // ⚠️ **파일별 관측값을 반드시 함께 싣는다.** 이 줄이 없던 동안 `nestedByPath` 수정은
      // 어댑터·survey에서만 살아 있었고 프로덕션 pull은 포맷 단위 boolean으로 돌았다 (§1.35).
      // 빈 객체를 만들지 않는다 — 관측하지 못한 것과 "전부 flat"은 다르다.
      ...(input.read.nestedByPath === undefined ? {} : { nestedByPath: input.read.nestedByPath }),
      baseLocale: input.baseLocale,
    },
    locales: input.format.locales,
    keys: baseEntries.map((e) => ({
      key: e.key,
      sourceText: e.message,
      namespace: namespaceOf(e.key),
      ...(e.description === undefined ? {} : { description: e.description }),
      // ⚠️ `e.order ? …`로 쓰면 **0이 falsy라 파일의 첫 키가 순서를 잃는다.**
      ...(e.order === undefined ? {} : { order: e.order }),
    })),
    // **base 로케일도 보낸다** — base도 편집 가능하고 Translation 행을 가져야 한다 (MVP §3.2).
    translations: input.read.locales.flatMap((l) =>
      l.entries.map((e) => ({
        locale: l.locale,
        key: e.key,
        value: e.message,
        // **그 로케일 파일이 실제로 갖고 있던** chrome 필드다. 키 단위 `keys[].description`과
        // 합치면 base 값을 비-base에 복제하게 되고, 그건 병합이다.
        ...(e.description === undefined ? {} : { description: e.description }),
        ...(e.placeholders === undefined ? {} : { placeholders: e.placeholders }),
      })),
    ),
    refs,
  };

  return { payload, unknownRefs: input.scanRefs.filter((r) => !keySet.has(r.key)).length };
}
