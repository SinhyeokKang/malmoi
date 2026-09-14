import { describe, expect, it } from "vitest";
import { planSurfaceSelection } from "../select-surfaces";
import type { CandidateSummary } from "../detect";
const candidate = (path: string, outputPaths: string[]): CandidateSummary => ({
  adapter: "json-catalog", label: "JSON", pathTemplate: path, outputPaths,
  locales: ["en", "ko"], baseLocale: "en", keys: { status: "counted", count: 1 }, samples: [],
});
const candidates = [candidate("a/i18n/{locale}.json", ["a/i18n/en.json"]), candidate("b/i18n/{locale}.json", ["b/i18n/en.json"])];
describe("표면 선택 판정", () => {
  it("체크 순서 대신 탐지 순서를 유지하고 slug 충돌을 피한다", () => {
    const result = planSurfaceSelection(candidates, new Set([1, 0]), { 0: "ko", 1: "en" });
    expect(result).toEqual({ defaultIndex: 0, conflicts: [], formats: [
      { adapter: "json-catalog", pathTemplate: "a/i18n/{locale}.json", baseLocale: "ko", surfaceSlug: "i18n" },
      { adapter: "json-catalog", pathTemplate: "b/i18n/{locale}.json", baseLocale: "en", surfaceSlug: "i18n-2" },
    ] });
  });
  it("체크 하나는 그 후보만 제출하고 빈 체크는 기본 표면도 없다", () => {
    expect(planSurfaceSelection(candidates, new Set([1]), { 1: "ko" })).toMatchObject({ defaultIndex: 1, formats: [{ surfaceSlug: "i18n", baseLocale: "ko" }], conflicts: [] });
    expect(planSurfaceSelection(candidates, new Set(), {})).toEqual({ defaultIndex: null, formats: [], conflicts: [] });
  });
  it("다른 후보의 같은 출력만 충돌하고 해제하면 사라진다", () => {
    const pair = [candidate("a/{locale}.json", ["shared", "shared"]), candidate("b/{locale}.json", ["shared"])];
    expect(planSurfaceSelection(pair, new Set([0, 1]), { 0: "en", 1: "ko" }).conflicts).toEqual([{ path: "shared", surfaceSlugs: ["a", "b"] }]);
    expect(planSurfaceSelection(pair, new Set([0]), { 0: "en" }).conflicts).toEqual([]);
  });
});
