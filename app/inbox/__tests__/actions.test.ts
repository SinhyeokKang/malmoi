import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadAttentionBadgeAction, openAttentionInboxAction } from "../actions";
import { isUnread } from "@/lib/inbox/plan";
const mocks = vi.hoisted(() => ({ session: vi.fn(), db: vi.fn(), load: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.db }));
vi.mock("@/lib/inbox/load", () => ({ loadAttentionInbox: mocks.load }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const now = new Date("2026-10-05T00:00:00Z");
const plan = { groups: [], unread: 2 };
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); vi.useFakeTimers(); vi.setSystemTime(now);
  mocks.session.mockResolvedValue({ status: "ok", userId: "u1" });
  mocks.db.mockReturnValue({ user: { updateMany: mocks.update } });
  mocks.load.mockResolvedValue(plan); mocks.update.mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(["none", "unavailable"])("세션 %s면 두 Action 모두 DB 없이 거부한다", async status => {
  mocks.session.mockResolvedValue({ status });
  expect(await loadAttentionBadgeAction()).toEqual({ status: "failed" });
  expect(await openAttentionInboxAction()).toEqual({ status: "failed" });
  expect(mocks.db).not.toHaveBeenCalled();
});
it("배지는 읽기만 하고 개수만 돌려준다", async () => {
  expect(await loadAttentionBadgeAction()).toEqual({ status: "ok", unread: 2 });
  expect(mocks.load).toHaveBeenCalledWith(mocks.db(), "u1");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});
it("조회 전 시각으로 단조 기록하고 조회 중 생긴 일은 다음에도 unread다", async () => {
  const later = new Date(now.getTime() + 1000);
  mocks.load.mockImplementation(async () => { vi.setSystemTime(later); return plan; });
  expect(await openAttentionInboxAction()).toEqual({ status: "ok", plan, loadedAt: now, marked: true });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "u1", OR: [{ attentionSeenAt: null }, { attentionSeenAt: { lt: now } }] }, data: { attentionSeenAt: now } });
  expect(isUnread("unsent", later, mocks.update.mock.calls[0]![0].data.attentionSeenAt)).toBe(true);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("더 새 워터마크 때문에 update 0행이어도 읽음은 성공이다", async () => {
  mocks.update.mockResolvedValue({ count: 0 });
  expect(await openAttentionInboxAction()).toMatchObject({ status: "ok", marked: true });
});
it("쓰기 실패는 목록을 보존하고 배지 지우기를 거부한다", async () => {
  mocks.update.mockRejectedValue(new TypeError("private write payload"));
  expect(await openAttentionInboxAction()).toEqual({ status: "ok", plan, loadedAt: now, marked: false });
  expect(console.error).toHaveBeenCalledExactlyOnceWith("Attention watermark write failed.", { userId: "u1", cause: "TypeError" });
});
it("조회 실패는 목록도 기록도 내지 않는다", async () => {
  mocks.load.mockRejectedValue(new TypeError("private read payload"));
  expect(await loadAttentionBadgeAction()).toEqual({ status: "failed" });
  expect(await openAttentionInboxAction()).toEqual({ status: "failed" });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledTimes(2);
  expect(console.error).toHaveBeenNthCalledWith(1, "Attention badge load failed.", { userId: "u1", cause: "TypeError" });
  expect(console.error).toHaveBeenNthCalledWith(2, "Attention inbox load failed.", { userId: "u1", cause: "TypeError" });
});
