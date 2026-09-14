import { describe, expect, it } from "vitest";
import { compareSurfaces, planSurfaceSlug, selectDefaultSurface, surfaceOwnership, surfaceLabel } from "../plan";
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
