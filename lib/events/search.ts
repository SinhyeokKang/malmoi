import type { EventPayload } from "./payload";

/**
 * 검색 문자열의 **유일한 관문** (logs-rework 결정 3).
 *
 * 조회는 `projectId`로 좁힌 뒤 `searchText: { contains: q }` **하나**다 — 종류가 늘어도 술어가 한
 * 벌이다. 대신 적재 지점마다 이 함수를 지나야 하고, **안 지나면 그 종류가 조용히 검색에서 빠진다.**
 *
 * ⚠️ **번역 본문·사람 이름·원문 이메일은 넣지 않는다** (spec §3.C.14 · 비목표의 전문 검색).
 * 넣으면 이 컬럼이 그 값들의 두 번째 사본이 되고, 계정 삭제가 지워야 할 자리가 하나 늘어난다.
 *
 * ⚠️ **잎이다 — import가 타입 하나다.**
 */

/** 소스가 많은 실행에서도 컬럼이 무한정 자라지 않는다. */
export const SEARCH_TEXT_MAX = 1000;

export function buildSearchText(ref: string, payload: EventPayload): string {
  return join([ref, ...tokens(payload)]);
}

function tokens(payload: EventPayload): (string | null)[] {
  switch (payload.kind) {
    case "TRANSLATION":
      // 전후 값은 **없다** — 키·소스·로케일로 찾는다.
      return [payload.surfaceSlug, payload.key, payload.locale];
    case "IMPORT":
      return [
        payload.source,
        ...payload.surfaceSlugs,
        ...payload.surfaces.map((surface) => surface.surfaceSlug),
        payload.errorCode,
        payload.refusal,
      ];
    case "PUBLISH":
      return [...payload.surfaceSlugs, payload.refusal];
    case "SURFACE":
      return [payload.surfaceSlug, payload.adapter, payload.baseLocale?.before ?? null, payload.baseLocale?.after ?? null];
    case "MEMBER":
      // 마스킹 라벨이다 — 원문 이메일은 payload에도 없다.
      return [payload.targetLabel, payload.role?.before ?? null, payload.role?.after ?? null];
    default:
      return [payload.field, payload.value?.before ?? null, payload.value?.after ?? null];
  }
}

/**
 * 소문자로 접고 중복을 지운 뒤 상한에서 자른다.
 *
 * ⚠️ **대소문자를 여기서 접는다** — 조회가 `contains` 하나라, 접지 않으면 술어가 두 벌이 되거나
 * Postgres의 `mode: "insensitive"`에 기대게 되고 그러면 인덱스 계획이 달라진다.
 */
function join(values: readonly (string | null)[]): string {
  const seen = new Set<string>();
  for (const value of values) {
    if (value === null) continue;
    const token = value.trim().toLowerCase();
    if (token !== "") seen.add(token);
  }
  return [...seen].join(" ").slice(0, SEARCH_TEXT_MAX);
}
