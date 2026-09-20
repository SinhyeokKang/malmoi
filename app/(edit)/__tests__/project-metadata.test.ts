import { beforeEach, expect, it, vi } from "vitest";
import { createHarness, sessionFor } from "./harness";
const h = vi.hoisted(() => ({ session: null as { user: { id: string } } | null, prisma: undefined as unknown, revalidate: vi.fn(), put: vi.fn(), del: vi.fn(), normalize: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/upload/store", () => ({ putImage: h.put, deleteImage: h.del }));
vi.mock("@/lib/upload/normalize", () => ({ normalizeImage: h.normalize }));
const actions = await import("../projects/[slug]/settings/actions");
let db: ReturnType<typeof createHarness>;
const old = "https://store.public.blob.vercel-storage.com/projects/p/old.webp";
const fresh = "https://store.public.blob.vercel-storage.com/projects/p/new.webp";
beforeEach(() => {
  vi.clearAllMocks(); h.session = sessionFor("owner");
  db = createHarness({ projects: [{ id: "p", slug: "alpha", name: "Before", archivedAt: new Date(0) }], members: [{ projectId: "p", userId: "owner", role: "OWNER" }, { projectId: "p", userId: "editor", role: "EDITOR" }] });
  h.prisma = db.prisma; Object.assign(db.projects[0]!, { image: old });
  h.put.mockResolvedValue(fresh); h.normalize.mockResolvedValue({ ok: true, bytes: Uint8Array.of(1, 2) });
});
const form = () => { const value = new FormData(); value.set("slug", "alpha"); value.set("image", new File(["png"], "p.png", { type: "image/png" })); return value; };
it("보관 중에도 표시 이름만 바꾸며 주소와 전체 셸 갱신을 유지한다", async () => {
  expect(await actions.updateProjectName({ slug: "alpha", name: "  After  " })).toEqual({ ok: true, name: "After" });
  expect(db.projects[0]).toMatchObject({ slug: "alpha", name: "After", archivedAt: new Date(0) });
  expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
});
it.each(["editor", "stranger", null])("%s는 메타데이터와 Blob에 쓰지 못한다", async user => {
  h.session = sessionFor(user);
  expect((await actions.updateProjectName({ slug: "alpha", name: "After" })).ok).toBe(false);
  expect((await actions.uploadProjectImage(form())).ok).toBe(false);
  expect((await actions.deleteProjectImage("alpha")).ok).toBe(false);
  expect(h.put).not.toHaveBeenCalled(); expect(h.del).not.toHaveBeenCalled(); expect(h.normalize).not.toHaveBeenCalled();
  expect(db.projects[0]?.name).toBe("Before");
});
it.each(["", " ", "x".repeat(201)])("이름 %s를 거부하고 저장값을 보존한다", async name => {
  expect((await actions.updateProjectName({ slug: "alpha", name })).ok).toBe(false);
  expect(db.projects[0]?.name).toBe("Before");
});
it("정규화한 바이트만 저장하고 커밋 뒤 이전 이미지를 정리한다", async () => {
  h.del.mockImplementation(async () => expect(db.projects[0]).toMatchObject({ image: fresh }));
  expect(await actions.uploadProjectImage(form())).toEqual({ ok: true });
  expect(h.put).toHaveBeenCalledWith(expect.stringMatching(/^projects\/p\/.+\.webp$/), Uint8Array.of(1, 2), "webp");
  expect(h.del).toHaveBeenCalledWith("projects/p/old.webp");
  expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("삭제 성공 뒤 URL이 null이고 이전 객체만 지운다", async () => {
  h.del.mockImplementation(async () => expect(db.projects[0]).toMatchObject({ image: null }));
  expect(await actions.deleteProjectImage("alpha")).toEqual({ ok: true });
  expect(h.del).toHaveBeenCalledWith("projects/p/old.webp");
  expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("업로드 거부는 기존 이미지를 지키고 Blob을 쓰지 않는다", async () => {
  h.normalize.mockResolvedValue({ ok: false, reason: "unsupported-type" });
  expect(await actions.uploadProjectImage(form())).toEqual({ ok: false, reason: "unsupported-type" });
  expect(h.put).not.toHaveBeenCalled(); expect(h.del).not.toHaveBeenCalled();
  expect(db.projects[0]).toMatchObject({ image: old });
});
it("DB 실패는 새 객체만 회수하고 이전 이미지를 남긴다", async () => {
  vi.spyOn(db.prisma, "$transaction").mockRejectedValueOnce(new Error("injected"));
  expect(await actions.uploadProjectImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(h.del).toHaveBeenCalledWith("projects/p/new.webp");
  expect(h.del).not.toHaveBeenCalledWith("projects/p/old.webp");
  expect(db.projects[0]).toMatchObject({ image: old });
});
