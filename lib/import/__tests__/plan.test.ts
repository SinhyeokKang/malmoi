import { describe, expect, it } from "vitest";
import { planRepositoryImport, type ImportPlanInput } from "../plan";

const now = new Date("2026-09-15T00:10:00Z");
const surface = { id: "s", slug: "default", archivedAt: null, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastImportStartedAt: null };
const input = (over: Partial<ImportPlanInput> = {}): ImportPlanInput => ({
  now, readiness: "ready", identity: "ok", repositoryImportToken: null, repositoryImportStartedAt: null, surfaces: [surface], ...over,
});

describe("planRepositoryImport", () => {
  it("ready인 연결 프로젝트의 활성 표면만 코드 유닛 slug 순으로 반환한다", () => {
    expect(planRepositoryImport(input({ surfaces: [surface, { ...surface, id: "a", slug: "A" }, { ...surface, id: "b", archivedAt: now }] })))
      .toMatchObject({ ok: true, surfaces: [{ slug: "A" }, { slug: "default" }], invalidFormat: [] });
  });
  it("readiness가 정체성·실행권·대상보다 먼저다", () => {
    expect(planRepositoryImport(input({ readiness: "setup", identity: "repo-replaced", repositoryImportToken: "other", repositoryImportStartedAt: now, surfaces: [] })))
      .toEqual({ ok: false, error: "not-ready" });
  });
  it.each(["not-connected", "repo-replaced"] as const)("정체성 %s는 실행권보다 먼저다", identity => {
    expect(planRepositoryImport(input({ identity, repositoryImportToken: "other", repositoryImportStartedAt: now }))).toEqual({ ok: false, error: identity });
  });
  it.each([0, 300_000, 300_001])("프로젝트 실행권 stale 경계 %s ms", age => {
    expect(planRepositoryImport(input({ repositoryImportToken: "other", repositoryImportStartedAt: new Date(+now - age) })).ok).toBe(age > 300_000);
  });
  it.each([0, 300_000, 300_001])("표면 진행 표시 stale 경계 %s ms", age => {
    expect(planRepositoryImport(input({ surfaces: [{ ...surface, lastImportStartedAt: new Date(+now - age) }] })).ok).toBe(age > 300_000);
  });
  it("활성 표면이 없으면 no-surfaces다", () => {
    expect(planRepositoryImport(input({ surfaces: [{ ...surface, archivedAt: now }] }))).toEqual({ ok: false, error: "no-surfaces" });
  });
  it("포맷 누락만 있어도 no-surfaces로 숨기지 않는다", () => {
    expect(planRepositoryImport(input({ surfaces: [{ ...surface, adapterName: null }] }))).toMatchObject({ ok: true, surfaces: [], invalidFormat: [{ slug: "default" }] });
  });
  it("알 수 없는 어댑터와 빈 포맷도 오류 표면에 남긴다", () => {
    expect(planRepositoryImport(input({ surfaces: [{ ...surface, adapterName: "unknown" }, { ...surface, id: "x", slug: "x", baseLocale: "" }] }))).toMatchObject({ ok: true, surfaces: [], invalidFormat: [{ slug: "default" }, { slug: "x" }] });
  });
});
