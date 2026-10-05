import { describe, expect, it } from "vitest";

import { planSurfaceRevival, type RevivalSurface } from "../plan-revival";

/**
 * 재추가 = 되살림 (sources-add-remove design §3.2). 같은 경로 + 같은 어댑터의 제거(보관) 행이 있으면 그 행을 되살려
 * `id`·`slug`·이력을 잇는다. 고르지 않으면 `-2` 새 행이 생겨 옛 키·번역이 분리된다(spec 문제 3).
 */

const row = (id: string, over: Partial<RevivalSurface> = {}): RevivalSurface => ({
  id, slug: id, pathTemplate: "i18n/{locale}.json", adapterName: "json-catalog", archivedAt: new Date("2026-10-01T00:00:00Z"), ...over,
});
const pick = (pathTemplate = "i18n/{locale}.json", adapter = "json-catalog") => ({ pathTemplate, adapter });

describe("planSurfaceRevival", () => {
  it("같은 경로·어댑터의 제거된 행을 되살린다 — id·slug를 그대로 쓴다", () => {
    expect(planSurfaceRevival([pick()], [row("s1", { slug: "i18n" })])).toEqual([{ kind: "revive", surfaceId: "s1", slug: "i18n" }]);
  });

  it("어댑터가 다르면 새 행이다", () => {
    expect(planSurfaceRevival([pick("i18n/{locale}.json", "code-dict")], [row("s1")])).toEqual([{ kind: "create" }]);
  });

  it("경로가 다르면 새 행이다", () => {
    expect(planSurfaceRevival([pick("other/{locale}.json")], [row("s1")])).toEqual([{ kind: "create" }]);
  });

  it("활성 행은 되살림 대상이 아니다", () => {
    expect(planSurfaceRevival([pick()], [row("s1", { archivedAt: null })])).toEqual([{ kind: "create" }]);
  });

  it("일치하는 제거 행이 여럿이면 archivedAt이 가장 최신인 행이다", () => {
    const older = row("old", { archivedAt: new Date("2026-09-01T00:00:00Z") });
    const newer = row("new", { archivedAt: new Date("2026-10-02T00:00:00Z") });
    expect(planSurfaceRevival([pick()], [newer, older])).toEqual([{ kind: "revive", surfaceId: "new", slug: "new" }]);
    expect(planSurfaceRevival([pick()], [older, newer])).toEqual([{ kind: "revive", surfaceId: "new", slug: "new" }]);
  });

  it("요청 순서대로 하나씩 낸다", () => {
    const a = row("a", { pathTemplate: "a/{locale}.json" });
    expect(planSurfaceRevival([pick("b/{locale}.json"), pick("a/{locale}.json")], [a])).toEqual([
      { kind: "create" }, { kind: "revive", surfaceId: "a", slug: "a" },
    ]);
    expect(planSurfaceRevival([], [a])).toEqual([]);
  });
});
