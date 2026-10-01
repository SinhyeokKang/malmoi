import { ALL_NAMESPACES } from "@/lib/routes";

import { isAllSources, type TranslationQuery } from "./query";

/**
 * **트리 = 목록 범위, 숫자는 그 노드를 눌렀을 때의 목록 수** (translation-tree-range — design §2.2·§3).
 *
 * ⚠️ **서버는 늘 전 소스를 한 번 읽고 JS로 범위를 자른다** — 조건별 트리 숫자도 같은 전 소스 행에서 센다(`tallyRows`). 목록과 트리가 같은 행에서
 *    나오므로 "트리 숫자 = 그 노드를 눌렀을 때의 목록 수"가 구조로 맞고, SQL `scope` 경로와 JS 경로가 같은 행을 내는지 지킬 필요가 없다.
 * ⚠️ **트리는 노드를 숨기지 않는다** — 0 노드는 화면이 `disabled`로 그린다(지금 범위·위치 노드는 예외). 09-30의 "0 노드 숨김 + 본 노드 유지"(`seen`)를 걷었다.
 * ⚠️ **잎이다 — import는 잎인 `lib/routes.ts`·`./query` 둘이다.** 클라이언트 화면이 읽는다. 행·트리 모양은 구조 타입으로 받는다.
 */
export type CountableTree = {
  projectKeyCount: number;
  surfaces: readonly { slug: string; keyCount: number; namespaces: readonly { name: string; keyCount: number }[] }[];
};
type Located = { surfaceSlug: string; namespace: string };

/** 목록 범위 — 전 소스 검색이면 `all`, 아니면 경로 소스와 `ns`(`ALL_NAMESPACES`는 소스 전체). */
export type ListRange = "all" | { surfaceSlug: string; ns: string };

export function rangeOf(query: Pick<TranslationQuery, "q" | "scope" | "ns">, routeSurfaceSlug: string): ListRange {
  return isAllSources(query) ? "all" : { surfaceSlug: routeSurfaceSlug, ns: query.ns };
}

export function inRange(row: Located, range: ListRange): boolean {
  return range === "all" || (row.surfaceSlug === range.surfaceSlug && (range.ns === ALL_NAMESPACES || row.namespace === range.ns));
}

/** 노드 하나의 일치 수 — RSC prop으로 넘기므로 직렬화 가능한 배열이다. */
export type NodeCount = { surfaceSlug: string; namespace: string; count: number };

/** 행을 소스·네임스페이스로 센다. 남이 정한 이름이라 안에서는 `Map`이다(프로토타입을 타지 않는다). */
export function tallyRows(rows: readonly Located[]): NodeCount[] {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let byNs = counts.get(row.surfaceSlug);
    if (byNs === undefined) counts.set(row.surfaceSlug, byNs = new Map());
    byNs.set(row.namespace, (byNs.get(row.namespace) ?? 0) + 1);
  }
  return [...counts].flatMap(([surfaceSlug, byNs]) => [...byNs].map(([namespace, count]) => ({ surfaceSlug, namespace, count })));
}

/**
 * `counts`가 `null`(조건 없음)이면 원본 그대로(같은 참조). 아니면 **모든 노드를 남기고** 숫자만 일치 수로 바꾼다.
 * `projectKeyCount`는 바꾸지 않는다 — 제목 배지 단위는 조건과 무관하다(DESIGN §6.1a).
 */
export function countTree<Tree extends CountableTree>(tree: Tree, counts: readonly NodeCount[] | null): Tree {
  if (counts === null) return tree;
  const bySurface = new Map<string, Map<string, number>>();
  for (const { surfaceSlug, namespace, count } of counts) {
    let byNs = bySurface.get(surfaceSlug);
    if (byNs === undefined) bySurface.set(surfaceSlug, byNs = new Map());
    byNs.set(namespace, (byNs.get(namespace) ?? 0) + count);
  }
  const surfaces = tree.surfaces.map(surface => {
    const byNs = bySurface.get(surface.slug);
    const namespaces = surface.namespaces.map(ns => ({ ...ns, keyCount: byNs?.get(ns.name) ?? 0 }));
    return { ...surface, keyCount: namespaces.reduce((sum, ns) => sum + ns.keyCount, 0), namespaces };
  });
  return { ...tree, surfaces };
}

/**
 * 트리 이동의 첫 키 — 목록 순서상 **처음 나오는** 그 위치의 키(design §3.2). 이제 범위로 자른 행에 쓰므로 사실상 첫 행이지만, 전 소스 범위의
 * `@first`가 다른 소스의 행을 고르지 않도록 판정을 남긴다. 없으면 `undefined`(선택·스크롤 없음).
 */
export function firstRowAt<Row extends Located>(rows: readonly Row[], surfaceSlug: string, ns: string): Row | undefined {
  return rows.find(row => row.surfaceSlug === surfaceSlug && (ns === ALL_NAMESPACES || row.namespace === ns));
}
