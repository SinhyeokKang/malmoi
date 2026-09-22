import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), load: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/surfaces/access", () => ({ getSurfaceAccess: mocks.access }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/sources/query", () => ({ loadSource: mocks.load }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { loadSourceDetail } from "../projects/[slug]/sources/actions";
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ status: "ok", userId: "u" }); mocks.access.mockResolvedValue({ status: "ok", projectId: "p", surfaceId: "s", role: "EDITOR", archived: false, surface: { lastImportToken: "private" } }); mocks.load.mockResolvedValue({ slug: "web" }); });
it("매 호출 인가 뒤 명시 reader만 반환하며 무효화하지 않는다", async () => {
  for (let i=0;i<2;i++) expect(await loadSourceDetail({ slug: "p", surfaceSlug: "web" })).toEqual({ ok: true, detail: { slug: "web" } });
  expect(mocks.access).toHaveBeenCalledTimes(2);
  expect(mocks.access).toHaveBeenCalledWith({}, { slug: "p", surfaceSlug: "web", userId: "u", permission: "translation:write" });
  expect(mocks.load).toHaveBeenCalledWith({}, "p", "s", "EDITOR");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it.each(["forbidden", "not-found", "unauthorized", "archived"])("거부 %s는 읽기 전에 끝난다", async status => {
  mocks.access.mockResolvedValue({ status });
  expect(await loadSourceDetail({ slug: "p", surfaceSlug: "foreign" })).toEqual({ rejected: status });
  expect(mocks.load).not.toHaveBeenCalled();
});
it("세션 저장소·reader 장애는 재시도 가능한 실패다", async () => {
  mocks.session.mockResolvedValue({ status: "unavailable" });
  expect(await loadSourceDetail({ slug: "p", surfaceSlug: "web" })).toEqual({ failed: true });
  mocks.session.mockResolvedValue({ status: "ok", userId: "u" });
  mocks.load.mockRejectedValue(new Error("database"));
  expect(await loadSourceDetail({ slug: "p", surfaceSlug: "web" })).toEqual({ failed: true });
});
