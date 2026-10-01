import { ALL_NAMESPACES } from "@/lib/routes";

/**
 * **필터 → 트리 반영** (translation-filter-scope — design §4).
 *
 * ⚠️ **숫자는 전량 목록의 행에서 센다 — 새 SQL이 없다.** 목록과 트리가 같은 행에서 나오므로 "트리 숫자 = 목록 수"가 구조로 보장되고,
 *    손 사본 드리프트(`pendingWhere` 선례)도 새 테넌트 격리 지점도 생기지 않는다. 호출부는 **서버 행**을 넘긴다(`savedOut` 행 제외).
 * ⚠️ **0 노드를 숨기되 `keep`은 남긴다** — 위치 노드(경로 소스·`ns`)와 이 목록 세대에서 이미 본 노드다. 같은 세대의 Save로 일치가 0이
 *    된 노드가 사라지면 편집 중인 위치와 포커스가 함께 빠진다(POSTMORTEM 2026-09-24 부류).
 * ⚠️ **잎이다 — import는 잎인 `lib/routes.ts` 하나다.** 클라이언트 화면이 읽는다. 행·트리 모양은 구조 타입으로 받는다.
 */
export type NarrowableTree = {
  projectKeyCount: number;
  surfaces: readonly { slug: string; keyCount: number; namespaces: readonly { name: string; keyCount: number }[] }[];
};
type Located = { surfaceSlug: string; namespace: string };

/** 트리 노드의 식별자 — `ALL_NAMESPACES`는 네임스페이스 노드가 아니라 소스 자신이다. NUL은 slug·이름에 올 수 없어 결합이 겹치지 않는다. */
export function nodeKey(surfaceSlug: string, ns?: string): string {
  return ns === undefined || ns === ALL_NAMESPACES ? surfaceSlug : `${surfaceSlug}\u0000${ns}`;
}

/** 행을 소스·네임스페이스로 센다. 남이 정한 이름이라 `Map`이다(프로토타입을 타지 않는다). */
export function countRows(rows: readonly Located[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let byNs = counts.get(row.surfaceSlug);
    if (byNs === undefined) counts.set(row.surfaceSlug, byNs = new Map());
    byNs.set(row.namespace, (byNs.get(row.namespace) ?? 0) + 1);
  }
  return counts;
}

/**
 * `counts`가 `null`(조건 없음)이면 원본 그대로. 아니면 숫자를 일치 수로 바꾸고 0 노드를 `keep`에 없으면 뺀다.
 * `projectKeyCount`는 바꾸지 않는다 — 제목 배지 단위는 조건과 무관하다(DESIGN §6.1a).
 */
export function narrowTree<Tree extends NarrowableTree>(tree: Tree, counts: ReadonlyMap<string, ReadonlyMap<string, number>> | null, keep: ReadonlySet<string>): Tree {
  if (counts === null) return tree;
  const surfaces = tree.surfaces.flatMap(surface => {
    const byNs = counts.get(surface.slug);
    const namespaces = surface.namespaces
      .map(ns => ({ ...ns, keyCount: byNs?.get(ns.name) ?? 0 }))
      .filter(ns => ns.keyCount > 0 || keep.has(nodeKey(surface.slug, ns.name)));
    const keyCount = namespaces.reduce((sum, ns) => sum + ns.keyCount, 0);
    return keyCount > 0 || namespaces.length > 0 || keep.has(nodeKey(surface.slug)) ? [{ ...surface, keyCount, namespaces }] : [];
  });
  return { ...tree, surfaces };
}

/**
 * 트리 이동의 대상 — 목록 순서상 **처음 나오는** 그 위치의 키(design §3.2). 정렬이 `Incomplete first`라 네임스페이스는 목록에서 연속하지
 * 않으므로 대개 rank 0(미완) 블록 안이다. 없으면 `undefined`(선택·스크롤 없음).
 */
export function firstRowAt<Row extends Located>(rows: readonly Row[], surfaceSlug: string, ns: string): Row | undefined {
  return rows.find(row => row.surfaceSlug === surfaceSlug && (ns === ALL_NAMESPACES || row.namespace === ns));
}
