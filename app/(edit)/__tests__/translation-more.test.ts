import { beforeEach, expect, it, vi } from "vitest";

/**
 * **"Show more keys"는 주소를 바꾸지 않고 다음 페이지를 읽는다** (audit-ux #19). 전엔 cursor가 URL에 남아 새로고침·공유·뒤로가기가
 * 그 페이지만 보였고, 키 선택도 cursor를 달고 다녔다. 읽기만 하므로 `revalidatePath`를 부르지 않는다.
 */
const state = vi.hoisted(() => ({
  session: { status: "ok", userId: "u1" } as { status: string; userId?: string },
  access: vi.fn(),
  list: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => state.session }));
vi.mock("@/lib/surfaces/access", () => ({ getSurfaceAccess: state.access }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/translation-list", () => ({ loadTranslationList: state.list }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));

const { loadMoreTranslationKeys } = await import("../actions");

const ROW = { keyId: "k3", surfaceSlug: "web", namespace: "common", key: "common.three", sourceText: "Three", missingCount: 0, totalLocales: 2, hasPending: false, hasReview: false, isNew: false };

beforeEach(() => {
  state.session = { status: "ok", userId: "u1" };
  state.access.mockReset().mockResolvedValue({ status: "ok", projectId: "p1", surfaceId: "s1" });
  state.list.mockReset().mockResolvedValue({ rows: [ROW], matchedKeyCount: 3, incompleteKeyCount: 0, nextCursor: "c2", effective: {}, selectedInResult: null });
  state.revalidate.mockReset();
});

it("인가된 표면에서 요청 조건 그대로 cursor 다음 페이지를 읽고, 행과 다음 cursor만 돌려준다", async () => {
  const result = await loadMoreTranslationKeys({ slug: "acme", surfaceSlug: "web", query: { ns: "common", scope: "namespace", q: "th", key: "k1" }, cursor: "c1" });
  expect(state.access).toHaveBeenCalledWith({}, { userId: "u1", slug: "acme", surfaceSlug: "web", permission: "translation:write" });
  // 조건은 서버가 다시 해석한다 — 선택 키는 페이지와 무관하다.
  expect(state.list).toHaveBeenCalledExactlyOnceWith({}, { projectId: "p1", routeSurfaceId: "s1", query: { ns: "common", scope: "namespace", completion: "all", q: "th", cursor: "c1" } });
  expect(result).toEqual({ ok: true, rows: [ROW], nextCursor: "c2" });
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("로그인이 없으면 목록에 닿기 전에 거부한다", async () => {
  state.session = { status: "none" };
  expect(await loadMoreTranslationKeys({ slug: "acme", surfaceSlug: "web", query: {}, cursor: "c1" })).toEqual({ ok: false, error: "unauthorized" });
  expect(state.access).not.toHaveBeenCalled();
  expect(state.list).not.toHaveBeenCalled();
});

it("접근이 거부되면 그 사유를 돌려주고 읽지 않는다", async () => {
  state.access.mockResolvedValue({ status: "not-found" });
  expect(await loadMoreTranslationKeys({ slug: "other", surfaceSlug: "web", query: {}, cursor: "c1" })).toEqual({ ok: false, error: "not-found" });
  expect(state.list).not.toHaveBeenCalled();
});

it("cursor가 없거나 모양이 틀리면 invalid input이다 — 첫 페이지를 다시 주지 않는다", async () => {
  expect(await loadMoreTranslationKeys({ slug: "acme", surfaceSlug: "web", query: {} })).toEqual({ ok: false, error: "invalid input" });
  expect(await loadMoreTranslationKeys({ slug: "acme", surfaceSlug: "web", query: { ns: 3 }, cursor: "c1" })).toEqual({ ok: false, error: "invalid input" });
  expect(state.list).not.toHaveBeenCalled();
});
