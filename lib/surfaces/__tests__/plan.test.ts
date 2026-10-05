import { describe, expect, it } from "vitest";
import { compareSurfaces, planAddConflicts, planSurfaceSlug, selectDefaultSurface, surfaceOwnership, surfaceLabel } from "../plan";
import { planMultiSurfacePull } from "@/lib/pull/surfaces";
import { renderSurfaceWorkflowStep } from "@/lib/onboarding/workflow";

describe("surface identity", () => {
  it("labels the original path fragment, not the default or collision slug", () => {
    expect(surfaceLabel("public/_locales/{locale}/messages.json")).toBe("_locales");
    expect(surfaceLabel("src/My Labels/{locale}.json")).toBe("My Labels");
  });
  it.each([
    ["_locales/{locale}/messages.json", "_locales"],
    ["src/i18n/{locale}.json", "i18n"],
    ["src/dictionaries/*.ts", "dictionaries"],
    ["packages/excalidraw/locales/{locale}.json", "locales"],
    ["src/new/{locale}.json", "new-2"],
    ["{locale}.json", "default"],
  ])("%s derives %s", (path, slug) => expect(planSurfaceSlug(path, [])).toBe(slug));
  it("allocates stable suffixes and normalizes case", () => {
    expect(planSurfaceSlug("src/I18N/{locale}.json", ["i18n", "i18n-2"])).toBe("i18n-3");
  });
  it("keeps detection priority for default selection", () => {
    const candidates = [{ id: "small", rank: 0, slug: "z", label: "Z" }, { id: "large", rank: 1, slug: "a", label: "A" }];
    expect(selectDefaultSurface(candidates)).toBe(candidates[0]);
    expect(selectDefaultSurface([])).toBeNull();
    expect([...candidates].sort((a, b) => compareSurfaces(a.rank, b.rank))).toEqual(candidates);
    expect([...candidates].sort((a, b) => compareSurfaces(a.slug, b.slug))[0]?.id).toBe("large");
    expect([...candidates].sort((a, b) => compareSurfaces(a.label, b.label))[0]?.id).toBe("large");
  });
});

describe("surface file ownership", () => {
  const a = { surfaceId: "1", surfaceSlug: "a", paths: ["a/en.json", "shared.json"] };
  const b = { surfaceId: "2", surfaceSlug: "b", paths: ["shared.json"] };
  it("rejects overlap with deterministic owners and path", () => {
    const expected = { ok: false, conflicts: [{ path: "shared.json", surfaceSlugs: ["a", "b"] }] };
    expect(surfaceOwnership([a, b])).toEqual(expected);
    expect(surfaceOwnership([b, a])).toEqual(expected);
    expect(surfaceOwnership([])).toEqual({ ok: true });
  });
  it("flattens plans by path regardless of registration order", () => {
    const plans = [
      { surfaceId: "2", surfaceSlug: "b", files: [{ path: "b/en.json", content: "B" }] },
      { surfaceId: "1", surfaceSlug: "a", files: [{ path: "a/en.json", content: "A" }] },
    ];
    expect(planMultiSurfacePull(plans)).toEqual([plans[1]!.files[0], plans[0]!.files[0]]);
    expect(planMultiSurfacePull([...plans].reverse())).toEqual(planMultiSurfacePull(plans));
    expect(() => planMultiSurfacePull(plans.map(p => ({ ...p, files: [{ path: "shared.json", content: null }] })))).toThrow(/shared.json/);
  });
});

it("renders a deterministic surface step with an explicit path", () => {
  const input = { slug: "demo", surfaceSlug: "i18n", pathTemplate: "src/i18n/{locale}.json", adapter: "json-catalog" as const, baseLocale: "en" };
  const output = renderSurfaceWorkflowStep(input);
  expect(output).toBe(renderSurfaceWorkflowStep(input));
  expect(output).toContain("surface: i18n");
  expect(output).toContain('path-template: "src/i18n/{locale}.json"');
  expect(output).toContain("${{ secrets.PUSH_TOKEN }}");
  expect(output).not.toContain("concurrency:");
});

/**
 * **추가 거부의 충돌 줄은 "추가하려던 템플릿 · 지금 그 파일을 쥔 소스"다** (malmoi#194). 전엔 파일마다 한 줄에 계획 slug까지 섞여
 * `i18n/emails/de.json · emails, emails-2`로 읽혔다 — `emails-2`는 거부된 추가가 받을 뻔한 slug라 존재한 적이 없다.
 */
describe("planAddConflicts", () => {
  const existing = [{ surfaceId: "s-emails", surfaceSlug: "emails", paths: ["i18n/emails/de.json", "i18n/emails/en.json"] }, { surfaceId: "s-web", surfaceSlug: "web", paths: ["web/en.json"] }];
  const addition = (surfaceId: string, pathTemplate: string, paths: string[]) => ({ surfaceId, pathTemplate, paths });

  it("충돌이 없으면 ok다", () => {
    expect(planAddConflicts(existing, [addition("new", "app/{locale}.json", ["app/en.json"])])).toEqual({ ok: true });
  });
  it("템플릿 하나에 한 줄이고, 계획 slug 없이 기존 소유자만 든다", () => {
    expect(planAddConflicts(existing, [addition("new", "i18n/emails/{locale}.json", ["i18n/emails/de.json", "i18n/emails/en.json", "i18n/emails/fr.json"])]))
      .toEqual({ ok: false, conflicts: [{ path: "i18n/emails/{locale}.json", surfaceSlugs: ["emails"] }] });
  });
  it("여러 기존 소스와 겹치면 그 slug를 정렬해 한 번씩 든다", () => {
    expect(planAddConflicts(existing, [addition("new", "{locale}/all.json", ["web/en.json", "i18n/emails/de.json", "i18n/emails/en.json"])]))
      .toEqual({ ok: false, conflicts: [{ path: "{locale}/all.json", surfaceSlugs: ["emails", "web"] }] });
  });
  it("추가끼리만 겹치면 둘 다 거부 줄이고 소유자는 비어 있다 — 아직 아무도 그 파일을 쥐지 않았다", () => {
    expect(planAddConflicts([], [addition("a", "x/{locale}.json", ["x/en.json"]), addition("b", "x/{locale}/m.json", ["x/en.json"])]))
      .toEqual({ ok: false, conflicts: [{ path: "x/{locale}.json", surfaceSlugs: [] }, { path: "x/{locale}/m.json", surfaceSlugs: [] }] });
  });
});
