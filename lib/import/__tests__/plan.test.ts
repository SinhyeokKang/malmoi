import { describe, expect, it } from "vitest";
import { hasLiveInternalImport, IMPORT_STALE_AFTER_SECONDS, planRepositoryImport, type ImportPlanInput } from "../plan";

const now = new Date("2026-09-15T00:10:00Z");
const surface = { id: "s", slug: "default", archivedAt: null, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastImportStartedAt: null };
const input = (over: Partial<ImportPlanInput> = {}): ImportPlanInput => ({
  now, readiness: "ready", identity: "ok", repositoryImportToken: null, repositoryImportStartedAt: null, surfaces: [surface], runningSync: null, ...over,
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
  it.each(["unpinned", "repo-replaced"] as const)("정체성 %s는 실행권보다 먼저다", identity => {
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
  it("진행 중인 Publish가 있으면 수동 Sync는 already-running이다 (없음 → ok 대조, sync-edit-protection T1)", () => {
    expect(planRepositoryImport(input({ runningSync: { startedAt: new Date(+now - 5_000) } }))).toEqual({ ok: false, error: "already-running" });
    expect(planRepositoryImport(input({ runningSync: null })).ok).toBe(true);
  });
  it.each([0, 300_000, 300_001])("Publish stale 경계 %s ms — 실행권·표면 표시와 같은 경계", age => {
    expect(planRepositoryImport(input({ runningSync: { startedAt: new Date(+now - age) } })).ok).toBe(age > 300_000);
  });
});

/**
 * **살아 있는 내부 적재가 있나** (Codex 교차 리뷰 🟡) — 만료된 `import:` 행을 닫아도 되는지의 판정. `acquire`와 야간 방문이 **같은 이 판정**을
 * 쓴다 — 야간이 적재에 들어가지 않는 밤(head 같음·보류)에도 죽은 실행의 `Running…`을 닫게 하려는 것이고, 살아 있는 lease는 절대 안 닫는다.
 * 첫 적재(온보딩)는 `repositoryImportToken` 없이 표면 표시(`lastImportStartedAt`)만 세우므로 그쪽도 본다.
 */
describe("hasLiveInternalImport", () => {
  const fresh = new Date(+now - 5_000);
  const stale = new Date(+now - (IMPORT_STALE_AFTER_SECONDS + 5) * 1000);
  const base = { now, repositoryImportToken: null, repositoryImportStartedAt: null, surfaces: [surface] };
  it("표시가 없으면 false — 닫아도 된다", () => expect(hasLiveInternalImport(base)).toBe(false));
  it("실행권 토큰이 살아 있으면 true", () => expect(hasLiveInternalImport({ ...base, repositoryImportToken: "t", repositoryImportStartedAt: fresh })).toBe(true));
  it("실행권 토큰이 만료됐으면 false", () => expect(hasLiveInternalImport({ ...base, repositoryImportToken: "t", repositoryImportStartedAt: stale })).toBe(false));
  it("활성 표면의 진행 표시가 살아 있으면 true(첫 적재·CI)", () => expect(hasLiveInternalImport({ ...base, surfaces: [{ ...surface, lastImportStartedAt: fresh }] })).toBe(true));
  it("보관 표면의 표시는 보지 않는다 — planRepositoryImport와 같다", () =>
    expect(hasLiveInternalImport({ ...base, surfaces: [{ ...surface, archivedAt: now, lastImportStartedAt: fresh }] })).toBe(false));
  it("planRepositoryImport의 already-running과 같은 판정이다(Publish 제외)", () => {
    const live = { repositoryImportToken: "t", repositoryImportStartedAt: fresh };
    expect(planRepositoryImport(input(live))).toEqual({ ok: false, error: "already-running" });
    expect(hasLiveInternalImport({ ...base, ...live })).toBe(true);
  });
});
