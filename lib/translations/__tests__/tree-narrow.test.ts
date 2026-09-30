import { describe, expect, it } from "vitest";

import { ALL_NAMESPACES } from "../query";
import { countRows, firstRowAt, narrowTree, nodeKey, type NarrowableTree } from "../tree-narrow";

/**
 * **필터 → 트리 반영** (translation-filter-scope — design §4). 트리 숫자는 전량 목록의 행에서 센다 — 새 SQL이 없어서 "트리 숫자 = 목록 수"가
 * 구조로 보장된다. 0 노드는 숨기되 위치 노드와 이 세대에서 이미 본 노드(`keep`)는 남는다 — 편집 중인 위치가 Save 재검증으로 사라지면
 * 포커스가 body로 빠진다(POSTMORTEM 2026-09-24 부류).
 */
const tree: NarrowableTree = {
  projectKeyCount: 9,
  surfaces: [
    { slug: "app", keyCount: 2, namespaces: [{ name: "app", keyCount: 2 }] },
    { slug: "web", keyCount: 7, namespaces: [{ name: "auth", keyCount: 3 }, { name: "common", keyCount: 4 }] },
  ],
};
const row = (keyId: string, surfaceSlug: string, namespace: string) => ({ keyId, surfaceSlug, namespace });

describe("countRows", () => {
  it("빈 rows는 빈 Map이다", () => {
    expect(countRows([]).size).toBe(0);
  });

  it("소스·네임스페이스별로 세고, 합은 rows.length다", () => {
    const rows = [row("w1", "web", "auth"), row("a1", "app", "app"), row("w2", "web", "auth"), row("w3", "web", "common")];
    const counts = countRows(rows);
    expect(counts.get("web")?.get("auth")).toBe(2);
    expect(counts.get("web")?.get("common")).toBe(1);
    expect(counts.get("app")?.get("app")).toBe(1);
    expect([...counts.values()].flatMap(m => [...m.values()]).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it("남이 정한 이름(__proto__)도 센다 — Map이라 프로토타입을 타지 않는다", () => {
    expect(countRows([row("x", "web", "__proto__")]).get("web")?.get("__proto__")).toBe(1);
  });
});

describe("narrowTree", () => {
  const none = new Set<string>();

  it("counts가 null(조건 없음)이면 원본 그대로다", () => {
    expect(narrowTree(tree, null, none)).toBe(tree);
  });

  it("숫자를 일치 수로 바꾸고 0인 네임스페이스·소스를 숨긴다", () => {
    const narrowed = narrowTree(tree, countRows([row("w1", "web", "common"), row("w2", "web", "common")]), none);
    expect(narrowed.surfaces).toEqual([{ slug: "web", keyCount: 2, namespaces: [{ name: "common", keyCount: 2 }] }]);
  });

  it("projectKeyCount는 바꾸지 않는다 — 제목 배지 단위는 조건과 무관하다 (DESIGN §6.1a)", () => {
    expect(narrowTree(tree, countRows([]), none).projectKeyCount).toBe(9);
  });

  it("다른 소스의 필드(id·locales 등)는 그대로 싣는다", () => {
    const rich = { projectKeyCount: 1, surfaces: [{ slug: "web", id: "s1", locales: ["en"], keyCount: 1, namespaces: [{ name: "a", keyCount: 1 }] }] };
    expect(narrowTree(rich, countRows([row("k", "web", "a")]), none).surfaces[0]).toMatchObject({ id: "s1", locales: ["en"] });
  });

  it("위치 소스는 일치가 0이어도 0으로 남는다 — A 경로에서 C 값을 검색한 경우 (조건 2)", () => {
    const narrowed = narrowTree(tree, countRows([row("a1", "app", "app")]), new Set([nodeKey("web")]));
    expect(narrowed.surfaces).toEqual([
      { slug: "app", keyCount: 1, namespaces: [{ name: "app", keyCount: 1 }] },
      { slug: "web", keyCount: 0, namespaces: [] },
    ]);
  });

  it("위치 네임스페이스는 0이어도 남고, 그 소스도 함께 남는다", () => {
    const narrowed = narrowTree(tree, countRows([]), new Set([nodeKey("web"), nodeKey("web", "auth")]));
    expect(narrowed.surfaces).toEqual([{ slug: "web", keyCount: 0, namespaces: [{ name: "auth", keyCount: 0 }] }]);
  });

  it("keep에 있는 0 노드는 남는다 — 같은 세대의 Save로 0이 된 노드는 숫자만 바뀐다 (조건 6)", () => {
    const first = narrowTree(tree, countRows([row("w1", "web", "auth"), row("a1", "app", "app")]), none);
    const keep = new Set(first.surfaces.flatMap(s => [nodeKey(s.slug), ...s.namespaces.map(ns => nodeKey(s.slug, ns.name))]));
    const after = narrowTree(tree, countRows([row("a1", "app", "app")]), keep);
    expect(after.surfaces).toEqual([
      { slug: "app", keyCount: 1, namespaces: [{ name: "app", keyCount: 1 }] },
      { slug: "web", keyCount: 0, namespaces: [{ name: "auth", keyCount: 0 }] },
    ]);
  });

  it("ALL_NAMESPACES는 네임스페이스 노드가 아니다 — 위치가 소스 전체면 소스만 남긴다", () => {
    expect(nodeKey("web", ALL_NAMESPACES)).toBe(nodeKey("web"));
  });

  it("소스 slug와 네임스페이스 이름의 결합이 다른 노드와 겹치지 않는다", () => {
    expect(nodeKey("a", "b/c")).not.toBe(nodeKey("a/b", "c"));
  });
});

describe("firstRowAt — 트리 이동의 대상 (design §3.2)", () => {
  // 정렬은 Incomplete first(rank → surfaceSlug → sortIndex → key)라 네임스페이스가 목록에서 연속하지 않는다.
  const rows = [row("w2", "web", "common"), row("a1", "app", "app"), row("w1", "web", "auth"), row("w9", "web", "common")];

  it("빈 rows는 undefined다", () => {
    expect(firstRowAt([], "web", "auth")).toBeUndefined();
  });

  it("그 위치의 키가 없으면 undefined다", () => {
    expect(firstRowAt(rows, "web", "billing")).toBeUndefined();
    expect(firstRowAt(rows, "docs", ALL_NAMESPACES)).toBeUndefined();
  });

  it("ALL_NAMESPACES면 그 소스의 첫 행이다", () => {
    expect(firstRowAt(rows, "web", ALL_NAMESPACES)?.keyId).toBe("w2");
    expect(firstRowAt(rows, "app", ALL_NAMESPACES)?.keyId).toBe("a1");
  });

  it("목록 순서상 처음 나오는 그 위치의 키다 — rank 0 블록의 행이 뒤쪽 같은 ns 행보다 먼저", () => {
    expect(firstRowAt(rows, "web", "common")?.keyId).toBe("w2");
    expect(firstRowAt(rows, "web", "auth")?.keyId).toBe("w1");
  });

  it("같은 이름의 네임스페이스가 다른 소스에 있어도 그 소스의 것만 고른다", () => {
    expect(firstRowAt([row("a9", "app", "common"), ...rows], "web", "common")?.keyId).toBe("w2");
  });
});
