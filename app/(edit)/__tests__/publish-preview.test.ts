import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), read: vi.fn(), db: {} }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/auth/query", () => ({ getProjectAccess: mocks.access }));
vi.mock("@/lib/db", () => ({ getPrisma: () => mocks.db }));
vi.mock("@/lib/publish/read", () => ({ readPublishPreview: mocks.read }));
import { loadPublishPreview } from "../publish-actions";
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ status: "ok", userId: "editor" }); mocks.access.mockResolvedValue({ status: "ok", projectId: "authorized-id" }); });
it("EDITOR도 translation:write 인가로 PR 번호를 읽고 인가가 준 projectId만 조회한다", async () => {
  const preview = { groups: [], total: 0, truncated: 0, openPr: { number: 12, url: "https://github.com/o/r/pull/12" } };
  mocks.read.mockResolvedValue(preview);
  expect(await loadPublishPreview({ slug: "acme" })).toEqual(preview);
  expect(mocks.access).toHaveBeenCalledWith(mocks.db, { userId: "editor", slug: "acme", permission: "translation:write" });
  expect(mocks.read).toHaveBeenCalledWith(mocks.db, "authorized-id", "acme");
});
it.each(["none", "unavailable"])("세션 %s이면 읽지 않는다", async status => {
  mocks.session.mockResolvedValue({ status }); expect(await loadPublishPreview({ slug: "acme" })).toBeNull(); expect(mocks.read).not.toHaveBeenCalled();
});
it("인가 실패는 미리보기를 막는다", async () => { mocks.access.mockResolvedValue({ status: "forbidden" }); expect(await loadPublishPreview({ slug: "acme" })).toBeNull(); expect(mocks.read).not.toHaveBeenCalled(); });
it("조회 예외는 진단 원문 없이 실패로 온다", async () => { mocks.read.mockRejectedValue(new Error("secret")); expect(await loadPublishPreview({ slug: "acme" })).toBeNull(); });
