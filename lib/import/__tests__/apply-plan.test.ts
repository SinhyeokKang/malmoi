import { describe, expect, it } from "vitest";
import { planImportApply, type ImportApplyInput } from "../apply-plan";
const now = new Date("2026-09-15T00:10:00Z");
const settings = { repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false, nestedByPath: null };
const input = (over: Partial<ImportApplyInput> = {}): ImportApplyInput => ({ now, token: "mine", currentToken: "mine", startedAt: now, capturedRevision: 0, currentRevision: 0, authorized: true, archived: false, capturedSettings: settings, currentSettings: settings, ...over });

describe("planImportApply", () => {
  it("revision이 같으면 커밋 시각 역행을 이유로 거부하지 않는다", () => expect(planImportApply(input())).toEqual({ ok: true }));
  it("동일 SHA CI도 revision 변경으로 검출한다", () => expect(planImportApply(input({ currentRevision: 1 }))).toEqual({ ok: false, reason: "superseded" }));
  it.each([null, "other"])("실행권 %s를 잃은 호출을 거부한다", currentToken => expect(planImportApply(input({ currentToken }))).toEqual({ ok: false, reason: "lease-lost" }));
  it.each([300_000, 300_001])("stale 경계 정각 %s", age => expect(planImportApply(input({ startedAt: new Date(+now - age) })).ok).toBe(age <= 300_000));
  it("시작 시각이 없으면 적용하지 않는다", () => expect(planImportApply(input({ startedAt: null })).ok).toBe(false));
  it("권한 회수·보관을 적용 시 거부한다", () => {
    expect(planImportApply(input({ authorized: false }))).toEqual({ ok: false, reason: "lease-lost" });
    expect(planImportApply(input({ archived: true }))).toEqual({ ok: false, reason: "lease-lost" });
  });
  for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
    it(`설정 ${key} 변경을 거부한다`, () => {
      expect(planImportApply(input({ currentSettings: { ...settings, [key]: key === "nested" ? true : key === "nestedByPath" ? { "en.json": true } : "changed" } }))).toEqual({ ok: false, reason: "superseded" });
    });
  }
});
