import { en } from "@/messages/en";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), load: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/surfaces/access", () => ({ getSurfaceAccess: mocks.access }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/sources/query", () => ({ loadSource: mocks.load }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { loadSourceDetail } from "../projects/[slug]/sources/actions";
vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ status: "ok", userId: "u" }); mocks.access.mockResolvedValue({ status: "ok", projectId: "p", surfaceId: "s", role: "EDITOR", archived: false, surface: { lastImportToken: "private" } }); mocks.load.mockResolvedValue({ slug: "web" }); });
it("매 호출 인가 뒤 명시 reader만 반환하며 무효화하지 않는다", async () => {
  for (let i=0;i<2;i++) expect(await loadSourceDetail({ slug: "p", surfaceSlug: "web" })).toEqual({ ok: true, detail: { slug: "web" } });
  expect(mocks.access).toHaveBeenCalledTimes(2);
  expect(mocks.access).toHaveBeenCalledWith({}, { slug: "p", surfaceSlug: "web", userId: "u", permission: "translation:write" });
  expect(mocks.load).toHaveBeenCalledWith({}, en, "p", "s", "EDITOR");
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

/**
 * 소스 제거 (sources-add-remove B-T7). 판정은 공유 코어(`lib/surfaces/remove.ts` — 실 PG는 `source-remove.integration.ts`)가 하고
 * Action은 세션·입력·무효화만 든다. **무효화는 커밋된 성공 뒤에만** — 거부에 무효화하면 화면이 이유 없이 다시 그려진다.
 */
const removal = vi.hoisted(() => ({ remove: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/surfaces/remove", async (original) => ({ ...(await original<object>()), removeSurface: removal.remove, previewSurfaceRemoval: removal.preview }));
import { previewSourceRemoval, removeSource } from "../projects/[slug]/sources/actions";

it("제거 성공은 그 프로젝트 레이아웃과 목록을 무효화하고 세션 사용자로 코어를 부른다", async () => {
  removal.remove.mockResolvedValue({ ok: true });
  expect(await removeSource({ slug: "p", surfaceSlug: "web", approval: null })).toEqual({ ok: true });
  expect(removal.remove).toHaveBeenCalledWith({}, { userId: "u" }, { slug: "p", surfaceSlug: "web", approval: null });
  expect(mocks.revalidate.mock.calls).toEqual([["/projects/p", "layout"], ["/projects"]]);
});
it.each(["forbidden", "archived", "stale-approval", "last-source", "importing", "not-found"])("제거 거부 %s는 그대로 돌려주고 무효화하지 않는다", async error => {
  removal.remove.mockResolvedValue({ ok: false, error });
  expect(await removeSource({ slug: "p", surfaceSlug: "web", approval: "f" })).toEqual({ ok: false, error });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("제거 입력이 틀리거나 세션이 없으면 코어를 부르지 않는다", async () => {
  expect(await removeSource({ slug: "p", surfaceSlug: "", approval: null })).toEqual({ ok: false, error: "invalid input" });
  expect(await removeSource({ slug: "p", surfaceSlug: "web" } as never)).toEqual({ ok: false, error: "invalid input" });
  mocks.session.mockResolvedValue({ status: "none" });
  expect(await removeSource({ slug: "p", surfaceSlug: "web", approval: null })).toEqual({ ok: false, error: "unauthorized" });
  mocks.session.mockResolvedValue({ status: "unavailable" });
  expect(await removeSource({ slug: "p", surfaceSlug: "web", approval: null })).toEqual({ ok: false, error: "unavailable" });
  expect(removal.remove).not.toHaveBeenCalled();
});
it("제거 미리보기는 읽기만 한다 — 무효화하지 않는다", async () => {
  removal.preview.mockResolvedValue({ ok: true, pendingCount: 2, approval: "f", openPr: "unknown" });
  expect(await previewSourceRemoval({ slug: "p", surfaceSlug: "web" })).toEqual({ ok: true, pendingCount: 2, approval: "f", openPr: "unknown" });
  expect(removal.preview).toHaveBeenCalledWith({}, { userId: "u" }, { slug: "p", surfaceSlug: "web" });
  removal.preview.mockResolvedValue({ ok: false, error: "forbidden" });
  expect(await previewSourceRemoval({ slug: "p", surfaceSlug: "web" })).toEqual({ ok: false, error: "forbidden" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("미리보기 장애는 거부가 아니라 실패다", async () => {
  removal.preview.mockRejectedValue(new Error("database"));
  expect(await previewSourceRemoval({ slug: "p", surfaceSlug: "web" })).toEqual({ ok: false, error: "unavailable" });
});
