import { describe, expect, it } from "vitest";

import { ALL_NAMESPACES, DEFAULT_TRANSLATION_QUERY, type TranslationQuery } from "../query";
import { countTree, firstRowAt, inRange, rangeOf, tallyRows, type CountableTree } from "../tree-narrow";

/**
 * **트리 = 목록 범위, 숫자는 (검색 중이면) Status를 끈 채 그 노드를 눌렀을 때의 목록 수** (translation-tree-range — design §2.2·§3).
 * 서버가 전 소스를 한 번 읽고 범위로 자른다 — 트리 숫자는 같은 전 소스 행에서 센다. 트리는 노드를 숨기지 않는다(0 노드는 화면이 `disabled`로 그린다).
 */
const tree: CountableTree = {
  projectKeyCount: 9,
  surfaces: [
    { slug: "app", keyCount: 2, namespaces: [{ name: "app", keyCount: 2 }] },
    { slug: "web", keyCount: 7, namespaces: [{ name: "auth", keyCount: 3 }, { name: "common", keyCount: 4 }] },
  ],
};
const row = (keyId: string, surfaceSlug: string, namespace: string) => ({ keyId, surfaceSlug, namespace });
const q = (over: Partial<TranslationQuery>): TranslationQuery => ({ ...DEFAULT_TRANSLATION_QUERY, ...over });

describe("rangeOf · inRange — 목록 범위", () => {
  it("전 소스 검색이면 all, 아니면 경로 소스·ns다", () => {
    expect(rangeOf(q({ scope: "project", q: "hi", ns: "auth" }), "web")).toBe("all");
    expect(rangeOf(q({ scope: "source" }), "web")).toEqual({ surfaceSlug: "web", ns: ALL_NAMESPACES });
    expect(rangeOf(q({ scope: "namespace", ns: "auth", q: "hi" }), "web")).toEqual({ surfaceSlug: "web", ns: "auth" });
  });

  it("세 갈래 — 전 소스 · 소스 · 네임스페이스(다른 소스의 같은 이름은 빠진다)", () => {
    expect(inRange(row("a", "app", "common"), "all")).toBe(true);
    expect(inRange(row("a", "web", "auth"), { surfaceSlug: "web", ns: ALL_NAMESPACES })).toBe(true);
    expect(inRange(row("a", "app", "auth"), { surfaceSlug: "web", ns: ALL_NAMESPACES })).toBe(false);
    expect(inRange(row("a", "web", "common"), { surfaceSlug: "web", ns: "common" })).toBe(true);
    expect(inRange(row("a", "web", "auth"), { surfaceSlug: "web", ns: "common" })).toBe(false);
    expect(inRange(row("a", "app", "common"), { surfaceSlug: "web", ns: "common" })).toBe(false);
  });
});

describe("tallyRows — 소스·네임스페이스별 수", () => {
  it("빈 행은 빈 배열이고, 합이 행 수다", () => {
    expect(tallyRows([])).toEqual([]);
    const rows = [row("w1", "web", "auth"), row("w2", "web", "common"), row("w3", "web", "common"), row("a1", "app", "app")];
    const tally = tallyRows(rows);
    expect(tally.reduce((sum, t) => sum + t.count, 0)).toBe(rows.length);
    expect(tally).toContainEqual({ surfaceSlug: "web", namespace: "common", count: 2 });
    expect(tally).toContainEqual({ surfaceSlug: "app", namespace: "app", count: 1 });
  });

  it("남이 정한 이름 — __proto__·constructor도 센다", () => {
    expect(tallyRows([row("x", "web", "__proto__"), row("y", "web", "__proto__"), row("z", "constructor", "constructor")])).toEqual([
      { surfaceSlug: "web", namespace: "__proto__", count: 2 },
      { surfaceSlug: "constructor", namespace: "constructor", count: 1 },
    ]);
  });
});

describe("countTree — 숨김 없이 숫자만 일치 수로", () => {
  it("counts가 null(조건 없음)이면 원본 그대로 — 같은 참조", () => {
    expect(countTree(tree, null)).toBe(tree);
  });

  it("모든 노드를 남기고 숫자만 바꾼다 — 0 노드도 남는다", () => {
    const counted = countTree(tree, tallyRows([row("w1", "web", "common"), row("w2", "web", "common")]));
    expect(counted.surfaces.map(s => s.slug)).toEqual(["app", "web"]);
    expect(counted.surfaces[0]).toMatchObject({ slug: "app", keyCount: 0, namespaces: [{ name: "app", keyCount: 0 }] });
    expect(counted.surfaces[1]).toMatchObject({ slug: "web", keyCount: 2, namespaces: [{ name: "auth", keyCount: 0 }, { name: "common", keyCount: 2 }] });
  });

  it("projectKeyCount와 노드의 다른 필드는 바꾸지 않는다", () => {
    expect(countTree(tree, tallyRows([])).projectKeyCount).toBe(9);
    const rich = { projectKeyCount: 1, surfaces: [{ id: "s1", slug: "web", locales: ["en"], keyCount: 1, namespaces: [{ name: "a", keyCount: 1 }] }] };
    expect(countTree(rich, tallyRows([])).surfaces[0]).toMatchObject({ id: "s1", locales: ["en"], keyCount: 0 });
  });

  it("__proto__ 네임스페이스의 수를 프로토타입에서 찾지 않는다", () => {
    const odd = { projectKeyCount: 2, surfaces: [{ slug: "web", keyCount: 2, namespaces: [{ name: "__proto__", keyCount: 1 }, { name: "constructor", keyCount: 1 }] }] };
    const counted = countTree(odd, tallyRows([row("x", "web", "__proto__")]));
    expect(counted.surfaces[0]?.namespaces).toEqual([{ name: "__proto__", keyCount: 1 }, { name: "constructor", keyCount: 0 }]);
  });

  it("트리 숫자 = 같은 행으로 그 노드를 눌렀을 때의 목록 수다 — 호출부가 Status 없는 검색 행을 넘긴다 (조건 9)", () => {
    const rows = [row("w1", "web", "auth"), row("w2", "web", "common"), row("a1", "app", "app"), row("w3", "web", "common")];
    const counted = countTree(tree, tallyRows(rows));
    for (const surface of counted.surfaces) {
      expect(surface.keyCount).toBe(rows.filter(r => inRange(r, { surfaceSlug: surface.slug, ns: ALL_NAMESPACES })).length);
      for (const ns of surface.namespaces) expect(ns.keyCount).toBe(rows.filter(r => inRange(r, { surfaceSlug: surface.slug, ns: ns.name })).length);
    }
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
