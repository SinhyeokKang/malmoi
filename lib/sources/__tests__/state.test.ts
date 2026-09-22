import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planSourceActions } from "../actions";
import { createBaseLanguageForm, planBaseLanguageForm } from "../base-language";
import { localeProgress } from "@/lib/keys/view";

const input = { role: "OWNER" as const, archived: false, installed: true, pending: false, lastCommitSha: null, lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastCommitAt: null };
describe("소스 행의 행동", () => {
  it("소유자만 첫 적재를 실행한다", () => {
    expect(planSourceActions(input)).toMatchObject({ canEdit: true, canRetry: true, canOpen: false });
    expect(planSourceActions({ ...input, role: "EDITOR" })).toMatchObject({ canEdit: false, canRetry: false });
  });
  it.each([{ installed: false }, { archived: true }, { pending: true }, { lastImportStartedAt: new Date() }])("연결·보관·진행 중 상태를 거른다 %j", patch => {
    expect(planSourceActions({ ...input, ...patch }).canRetry).toBe(false);
  });
  it("첫 실패만 재시도하고 이후 실패에서도 기존 번역은 연다", () => {
    expect(planSourceActions({ ...input, lastImportError: "partial-import" }).canRetry).toBe(true);
    expect(planSourceActions({ ...input, lastImportError: "partial-import", lastCommitSha: "sha" })).toMatchObject({ canRetry: false, canOpen: true });
  });
});
describe("기준 언어 저장 상태", () => {
  it("선언값으로 시작하고 적용값 재선택은 저장할 변경이다", () => {
    const state = createBaseLanguageForm({ baseLocale: "en", declaredBaseLocale: "ko" });
    expect(state).toMatchObject({ baseline: "ko", draft: "ko" });
    expect(planBaseLanguageForm(state, { type: "change", value: "en" })).toMatchObject({ baseline: "ko", draft: "en" });
  });
  it("저장 중 refresh 뒤 실패해도 입력은 남고 기준은 최신이다", () => {
    let state = createBaseLanguageForm({ baseLocale: "en", declaredBaseLocale: null });
    state = planBaseLanguageForm(state, { type: "change", value: "ko" });
    state = planBaseLanguageForm(state, { type: "submit" });
    state = planBaseLanguageForm(state, { type: "refresh", value: "ja" });
    state = planBaseLanguageForm(state, { type: "failure", error: "forbidden" });
    expect(state).toMatchObject({ draft: "ko", baseline: "ja", pending: false, result: { error: "forbidden" } });
  });
  it("성공 전의 낡은 props가 제출값을 되돌리지 않는다", () => {
    let state = createBaseLanguageForm({ baseLocale: "en", declaredBaseLocale: null });
    state = planBaseLanguageForm(state, { type: "change", value: "ko" });
    state = planBaseLanguageForm(state, { type: "submit" });
    state = planBaseLanguageForm(state, { type: "success" });
    state = planBaseLanguageForm(state, { type: "refresh", value: "en" });
    expect(state).toMatchObject({ draft: "ko", baseline: "ko", pending: false });
  });
  it("성공이 이미 도착한 새 서버값을 덮지 않는다", () => {
    let state = createBaseLanguageForm({ baseLocale: "en", declaredBaseLocale: null });
    state = planBaseLanguageForm(state, { type: "change", value: "ko" });
    state = planBaseLanguageForm(state, { type: "submit" });
    state = planBaseLanguageForm(state, { type: "refresh", value: "ja" });
    state = planBaseLanguageForm(state, { type: "success" });
    expect(state).toMatchObject({ draft: "ja", baseline: "ja" });
  });
  it("첫 적재 전에는 가짜 기본 언어를 만들지 않는다", () => {
    expect(createBaseLanguageForm({ baseLocale: null, declaredBaseLocale: null }).draft).toBe("");
  });
});
it("동시 적재로 분모가 작아져도 진행률이 경계를 넘지 않는다", () => {
  const [row] = localeProgress({ locales: [{ code: "en", isBase: false, orphaned: false }], total: 1, cells: [{ localeCode: "en", needsReview: false }, { localeCode: "en", needsReview: false }, { localeCode: "en", needsReview: true }] });
  expect(row?.untranslated).toBe(0);
  expect(row?.percent).toBe(100);
});
it("클라이언트 잎은 서버·어댑터를 import하지 않는다", () => {
  for (const name of ["actions", "base-language"]) expect(readFileSync(`lib/sources/${name}.ts`, "utf8")).not.toMatch(/from ["']@\/lib\/(?:db|adapters)|import ["']server-only/);
});
