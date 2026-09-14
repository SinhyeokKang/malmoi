import { beforeEach, expect, it, vi } from "vitest";
import { createHarness } from "@/app/(edit)/__tests__/harness";
import { getSurfaceAccess, requireSurfaceAccess } from "../access";

const state = vi.hoisted(() => ({ prisma: undefined as unknown, projectAccess: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/db", () => ({ getPrisma: () => state.prisma }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: state.projectAccess }));
const fixture = () => createHarness({
  projects: [{ id: "p", slug: "project" }, { id: "other", slug: "other" }],
  members: [{ projectId: "p", userId: "owner", role: "OWNER" }, { projectId: "p", userId: "editor", role: "EDITOR" }],
  surfaces: [
    { id: "a", projectId: "p", slug: "a" },
    { id: "b", projectId: "p", slug: "archived", archivedAt: new Date(0) },
    { id: "foreign", projectId: "other", slug: "foreign" },
  ],
});
const input = { slug: "project", surfaceSlug: "a", permission: "translation:write" as const };
beforeEach(() => { vi.clearAllMocks(); state.projectAccess.mockResolvedValue({ projectId: "p", role: "OWNER", archived: false }); });

it.each(["owner", "editor"])("%s receives both authorized IDs", async userId => {
  const h = fixture();
  expect(await getSurfaceAccess(h.prisma, { ...input, userId })).toMatchObject({ status: "ok", projectId: "p", surfaceId: "a" });
});
it("does not query surfaces before project authorization", async () => {
  const h = fixture();
  expect(await getSurfaceAccess(h.prisma, { ...input, userId: "outsider" })).toEqual({ status: "not-found" });
  expect(h.spies.findSurface).not.toHaveBeenCalled();
});
/**
 * ⚠️ **두 래퍼가 같은 거부를 서로 다른 모양으로 낸다** — 소비자가 다르기 때문이다 (CLAUDE.md
 * "데이터 변경 경로"). 페이지는 404가 옳고, Server Action은 `{ ok: false, error }`를 돌려줘야
 * `saveTranslation`이 입력값을 남긴 채 문구를 고를 수 있다. 여기서 던지면 그 계약이 깨진다.
 *
 * `not-found`를 고르는 것은 프로젝트 부재와 같은 이유다 — 표면의 존재 여부를 노출하지 않고,
 * `ProjectAccess` 유니온에 이미 있어 `ACCESS_ERRORS`를 손으로 늘리지 않는다.
 */
it.each(["missing", "foreign", "archived"])("%s stops both wrappers, each in its own contract", async surfaceSlug => {
  const h = fixture(); state.prisma = h.prisma;
  await expect(getSurfaceAccess(h.prisma, { ...input, surfaceSlug, userId: "owner" })).resolves.toEqual({ status: "not-found" });
  await expect(requireSurfaceAccess({ ...input, surfaceSlug })).rejects.toThrow("notFound");
  expect(h.spies.findSurface).toHaveBeenLastCalledWith({ where: { projectId: "p", slug: surfaceSlug, archivedAt: null } });
});
it("page wrapper carries the scoped identity", async () => {
  const h = fixture(); state.prisma = h.prisma;
  expect(await requireSurfaceAccess(input)).toMatchObject({ projectId: "p", surfaceId: "a" });
});
