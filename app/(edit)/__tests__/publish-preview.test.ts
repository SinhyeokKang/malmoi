import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), read: vi.fn(), db: {} }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mocks.session }));
vi.mock("@/lib/auth/query", () => ({ getProjectAccess: mocks.access }));
vi.mock("@/lib/db", () => ({ getPrisma: () => mocks.db }));
vi.mock("@/lib/publish/read", () => ({ readPublishPreview: mocks.read }));
import { loadPublishPreview } from "../publish-actions";
import { PreviewBaseFileMissing } from "@/lib/publish/preview";
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ status: "ok", userId: "editor" }); mocks.access.mockResolvedValue({ status: "ok", projectId: "authorized-id" }); });
it("EDITOR도 translation:write 인가로 PR 번호를 읽고 인가가 준 projectId만 조회한다", async () => {
  const preview = { groups: [], total: 0, truncated: 0, openPr: { number: 12, url: "https://github.com/o/r/pull/12" } };
  mocks.read.mockResolvedValue(preview);
  expect(await loadPublishPreview({ slug: "acme" })).toEqual({ status: "ok", preview });
  expect(mocks.access).toHaveBeenCalledWith(mocks.db, { userId: "editor", slug: "acme", permission: "translation:write" });
  expect(mocks.read).toHaveBeenCalledWith(mocks.db, "authorized-id", "acme");
});
/**
 * ⚠️ **거부와 읽기 실패를 한 갈래로 접지 않는다** (launch-readiness L3.3). 전에는 전부 `null`이라 세션 만료가
 * "미리보기 실패 / Retry"로 그려졌고, Retry는 영영 같은 거부를 받는다. 거부는 실행 전 거부(`1h`)와 같은 갈래다.
 */
it.each([
  ["세션 없음", { status: "none" }, { status: "ok", projectId: "p" }, { status: "rejected", error: "unauthorized" }],
  ["인가 거부", { status: "ok", userId: "editor" }, { status: "forbidden" }, { status: "rejected", error: "forbidden" }],
  ["프로젝트 없음", { status: "ok", userId: "editor" }, { status: "not-found" }, { status: "rejected", error: "not-found" }],
  // 세션 저장소 장애는 거부가 아니다 — 다시 시도하면 풀릴 수 있다.
  ["세션 조회 장애", { status: "unavailable" }, { status: "ok", projectId: "p" }, { status: "failed" }],
])("%s는 읽지 않고 갈래를 말한다", async (_name, session, access, expected) => {
  mocks.session.mockResolvedValue(session); mocks.access.mockResolvedValue(access);
  expect(await loadPublishPreview({ slug: "acme" })).toEqual(expected);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("조회 예외는 진단 원문 없이 실패로 온다", async () => { mocks.read.mockRejectedValue(new Error("secret")); expect(await loadPublishPreview({ slug: "acme" })).toEqual({ status: "failed" }); });
/** base 언어 파일 부재는 실패가 아니라 **이유가 있는 거부**다 (coordinator review r1 — 사용자 결정). Try again은 같은 거부를 영영 받는다. */
it("base 파일 부재는 경로·브랜치를 든 refused로 온다 — failed(Try again)로 접지 않는다", async () => {
  mocks.read.mockRejectedValue(new PreviewBaseFileMissing("config/locales/en.yml", "main"));
  expect(await loadPublishPreview({ slug: "acme" })).toEqual({ status: "refused", reason: "base-file-missing", path: "config/locales/en.yml", branch: "main" });
});
