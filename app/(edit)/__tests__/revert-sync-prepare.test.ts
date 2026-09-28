import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor, type Seed } from "./harness";

/**
 * **Revert 두 Action과 Sync 준비 Action의 껍데기** (mcp-connector T4-0).
 *
 * 코어 추출 전에 박는 고정이다 — 이 셋은 지금까지 컴포넌트 mock으로만 참조돼 실행 테스트가 없었다. 인가·readiness는 하네스의
 * 실제 판정(`getSurfaceAccess`·`getProjectAccess`·`planProjectReadiness`)을 지나고, 코어(`previewKeyRevert`·`executeKeyRevert`·
 * `readDiscardApproval`)만 가짜다 — 하네스에 `TranslationBaseline`이 없고, 여기서 재려는 것은 코어가 아니라 그 앞뒤다.
 * ⚠️ mock 대상이 lib 모듈이라 추출 뒤에도 같은 테스트가 같은 경계를 잰다 — Action 파일 안을 mock하지 않는다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  prisma: undefined as unknown,
  revalidatePath: vi.fn(),
  previewKeyRevert: vi.fn(),
  executeKeyRevert: vi.fn(),
  readDiscardApproval: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => hoisted.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock("@/lib/keys/revert", () => ({ previewKeyRevert: hoisted.previewKeyRevert, executeKeyRevert: hoisted.executeKeyRevert }));
vi.mock("@/lib/import/approval", () => ({ readDiscardApproval: hoisted.readDiscardApproval }));

const { previewTranslationRevert, revertTranslationKey } = await import("../actions");
const { prepareRepositorySync } = await import("../projects/actions");

const CONFIRMATION = "a".repeat(64);

function seeded(over: Seed = {}) {
  return createHarness({
    projects: [{ id: "p1", slug: "acme" }, { id: "p2", slug: "fresh", lastCommitSha: null }],
    members: [
      { projectId: "p1", userId: "u-owner", role: "OWNER" },
      { projectId: "p1", userId: "u-editor", role: "EDITOR" },
      { projectId: "p2", userId: "u-owner", role: "OWNER" },
    ],
    users: [{ id: "u-owner", email: "owner@a.com" }, { id: "u-editor", email: "editor@a.com" }, { id: "u-stranger", email: "x@a.com" }],
    ...over,
  });
}

beforeEach(() => {
  hoisted.prisma = seeded().prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.revalidatePath.mockReset();
  hoisted.previewKeyRevert.mockReset().mockResolvedValue({ status: "ready", locales: [{ code: "ko", before: "b", after: "a" }], confirmation: CONFIRMATION });
  hoisted.executeKeyRevert.mockReset().mockResolvedValue({ status: "reverted", cells: [{ localeCode: "ko", value: "a" }] });
  hoisted.readDiscardApproval.mockReset().mockResolvedValue({ fingerprint: "f".repeat(64), pending: [{ id: "t1", token: "raw" }, { id: "t2", token: "raw2" }] });
});

describe("previewTranslationRevert", () => {
  it("OWNER면 인가가 돌려준 projectId·surfaceId와 세션 userId로 코어를 부르고 결과를 그대로 싣는다 — 읽기라 재검증하지 않는다", async () => {
    const result = await previewTranslationRevert({ slug: "acme", surfaceSlug: "default", keyId: "k1" });
    expect(hoisted.previewKeyRevert).toHaveBeenCalledExactlyOnceWith(hoisted.prisma, { projectId: "p1", surfaceId: "surface-p1", surfaceSlug: "default", keyId: "k1", userId: "u-owner" });
    expect(result).toEqual({ status: "ready", locales: [{ code: "ko", before: "b", after: "a" }], confirmation: CONFIRMATION });
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("EDITOR는 project:settings 거부를 blocked: forbidden으로 받는다 — 접근 오류 자리가 아니다", async () => {
    hoisted.session = sessionFor("u-editor");
    expect(await previewTranslationRevert({ slug: "acme", surfaceSlug: "default", keyId: "k1" })).toEqual({ status: "blocked", reason: "forbidden" });
    expect(hoisted.previewKeyRevert).not.toHaveBeenCalled();
  });

  it("멤버가 아니면 not-found, 로그인이 없으면 unauthorized, 모양이 틀리면 invalid input이다", async () => {
    hoisted.session = sessionFor("u-stranger");
    expect(await previewTranslationRevert({ slug: "acme", surfaceSlug: "default", keyId: "k1" })).toEqual({ status: "error", error: "not-found" });
    hoisted.session = null;
    expect(await previewTranslationRevert({ slug: "acme", surfaceSlug: "default", keyId: "k1" })).toEqual({ status: "error", error: "unauthorized" });
    hoisted.session = sessionFor("u-owner");
    expect(await previewTranslationRevert({ slug: "acme", surfaceSlug: "default" })).toEqual({ status: "error", error: "invalid input" });
    expect(hoisted.previewKeyRevert).not.toHaveBeenCalled();
  });

  it("첫 적재 전 프로젝트는 not-ready다", async () => {
    expect(await previewTranslationRevert({ slug: "fresh", surfaceSlug: "default", keyId: "k1" })).toEqual({ status: "error", error: "not-ready" });
    expect(hoisted.previewKeyRevert).not.toHaveBeenCalled();
  });
});

describe("revertTranslationKey", () => {
  it("되돌렸으면 번역을 읽는 화면을 다시 그린다 — 세그먼트 레이아웃과 두 목록", async () => {
    const result = await revertTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", confirmation: CONFIRMATION });
    expect(hoisted.executeKeyRevert).toHaveBeenCalledExactlyOnceWith(hoisted.prisma, { projectId: "p1", surfaceId: "surface-p1", surfaceSlug: "default", keyId: "k1", userId: "u-owner", confirmation: CONFIRMATION });
    expect(result).toEqual({ status: "reverted", cells: [{ localeCode: "ko", value: "a" }] });
    expect(hoisted.revalidatePath.mock.calls).toEqual([["/projects/acme", "layout"], ["/projects"], ["/projects/new"]]);
  });

  it("reconfirm·blocked는 아무것도 안 썼다 — 재검증하지 않는다", async () => {
    hoisted.executeKeyRevert.mockResolvedValueOnce({ status: "reconfirm" });
    expect(await revertTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", confirmation: CONFIRMATION })).toEqual({ status: "reconfirm" });
    hoisted.executeKeyRevert.mockResolvedValueOnce({ status: "blocked", reason: "busy" });
    expect(await revertTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", confirmation: CONFIRMATION })).toEqual({ status: "blocked", reason: "busy" });
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("EDITOR는 blocked: forbidden, 첫 적재 전은 not-ready, 확인값 모양이 틀리면 invalid input — 셋 다 코어에 닿지 않는다", async () => {
    hoisted.session = sessionFor("u-editor");
    expect(await revertTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", confirmation: CONFIRMATION })).toEqual({ status: "blocked", reason: "forbidden" });
    hoisted.session = sessionFor("u-owner");
    expect(await revertTranslationKey({ slug: "fresh", surfaceSlug: "default", keyId: "k1", confirmation: CONFIRMATION })).toEqual({ status: "error", error: "not-ready" });
    expect(await revertTranslationKey({ slug: "acme", surfaceSlug: "default", keyId: "k1", confirmation: "nope" })).toEqual({ status: "error", error: "invalid input" });
    expect(hoisted.executeKeyRevert).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("prepareRepositorySync", () => {
  it("OWNER에게 지문과 건수만 준다 — 토큰 원문은 응답에 없다", async () => {
    const result = await prepareRepositorySync({ slug: "acme" });
    expect(hoisted.readDiscardApproval).toHaveBeenCalledExactlyOnceWith(hoisted.prisma, { projectId: "p1", userId: "u-owner" });
    expect(result).toEqual({ approval: "f".repeat(64), unsent: 2 });
    expect(JSON.stringify(result)).not.toContain("raw");
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("EDITOR·비멤버·로그아웃·모양 오류는 전부 undefined다 — 화면은 null 승인으로 실행하고 서버가 reconfirm으로 답한다", async () => {
    hoisted.session = sessionFor("u-editor");
    expect(await prepareRepositorySync({ slug: "acme" })).toBeUndefined();
    hoisted.session = sessionFor("u-stranger");
    expect(await prepareRepositorySync({ slug: "acme" })).toBeUndefined();
    hoisted.session = null;
    expect(await prepareRepositorySync({ slug: "acme" })).toBeUndefined();
    hoisted.session = sessionFor("u-owner");
    expect(await prepareRepositorySync({ slug: "" })).toBeUndefined();
    expect(hoisted.readDiscardApproval).not.toHaveBeenCalled();
  });

  it("코어가 던지면 undefined로 접는다 — 던지면 Dialog가 digest 오류가 된다", async () => {
    hoisted.readDiscardApproval.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await prepareRepositorySync({ slug: "acme" })).toBeUndefined();
    spy.mockRestore();
  });
});
