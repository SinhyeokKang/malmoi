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
it.each(["missing", "foreign", "archived"])("%s has the same notFound result in both wrappers", async surfaceSlug => {
  const h = fixture(); state.prisma = h.prisma;
  await expect(getSurfaceAccess(h.prisma, { ...input, surfaceSlug, userId: "owner" })).rejects.toThrow("notFound");
  await expect(requireSurfaceAccess({ ...input, surfaceSlug })).rejects.toThrow("notFound");
  expect(h.spies.findSurface).toHaveBeenLastCalledWith({ where: { projectId: "p", slug: surfaceSlug, archivedAt: null } });
});
it("page wrapper carries the scoped identity", async () => {
  const h = fixture(); state.prisma = h.prisma;
  expect(await requireSurfaceAccess(input)).toMatchObject({ projectId: "p", surfaceId: "a" });
});
