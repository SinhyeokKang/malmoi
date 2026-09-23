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
  db = createHarness({ projects: [{ id: "p", slug: "alpha", name: "Before" }], members: [{ projectId: "p", userId: "owner", role: "OWNER" }, { projectId: "p", userId: "editor", role: "EDITOR" }] });
  h.prisma = db.prisma; Object.assign(db.projects[0]!, { image: old });
  h.put.mockResolvedValue(fresh); h.normalize.mockResolvedValue({ ok: true, bytes: Uint8Array.of(1, 2) });
});
const form = () => { const value = new FormData(); value.set("slug", "alpha"); value.set("image", new File(["png"], "p.png", { type: "image/png" })); return value; };
it("표시 이름만 바꾸며 주소와 전체 셸 갱신을 유지한다", async () => {
  expect(await actions.updateProjectName({ slug: "alpha", name: "  After  " })).toEqual({ ok: true, name: "After" });
  expect(db.projects[0]).toMatchObject({ slug: "alpha", name: "After" });
  expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
});
// 보관 = Restore만 (2026-09-24, 감사 #26) — 전에는 이 자리가 "보관 중에도 이름을 바꾼다"를 고정했다.
it("보관 중에는 이름·이미지 쓰기를 거부하고 올린 객체를 회수한다", async () => {
  Object.assign(db.projects[0]!, { archivedAt: new Date(0) });
  expect(await actions.updateProjectName({ slug: "alpha", name: "After" })).toEqual({ ok: false, error: "archived" });
  expect(await actions.uploadProjectImage(form())).toEqual({ ok: false, reason: "archived" });
  expect(await actions.deleteProjectImage("alpha")).toEqual({ ok: false, reason: "archived" });
  expect(db.projects[0]).toMatchObject({ name: "Before", image: old });
  expect(h.del).not.toHaveBeenCalledWith("projects/p/old.webp");
  // 거부될 업로드가 정규화·Blob을 태우지 않는다 — 잠금 안 판정 전에 진입점이 먼저 막는다.
  expect(h.normalize).not.toHaveBeenCalled(); expect(h.put).not.toHaveBeenCalled();
  // QA D1 — 보관 거부가 설정 화면을 보관 상태로 다시 그린다.
  expect(h.revalidate).toHaveBeenCalledWith("/projects/alpha", "layout");
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
/**
 * ⚠️ **커밋 뒤에 도는 것은 성공 여부를 못 바꾼다** (POSTMORTEM 2026-09-20 — `addSurfaces`와 같은 부류).
 * 여기 셋은 DB tx가 끝난 **뒤** `revalidatePath`·Blob 정리를 부르므로, 그 예외가 Action 밖으로 나가면
 * 화면이 저장된 값을 "실패"로 말하고 사용자가 업로드를 한 번 더 눌러 두 번째 객체를 만든다.
 */
it.each(["name", "upload", "delete"])("%s는 커밋 뒤 캐시 실패를 저장 실패로 보고하지 않는다", async kind => {
  h.revalidate.mockImplementationOnce(() => { throw new Error("cache failure"); });
  if (kind === "name") expect(await actions.updateProjectName({ slug: "alpha", name: "After" })).toEqual({ ok: true, name: "After" });
  if (kind === "upload") expect(await actions.uploadProjectImage(form())).toEqual({ ok: true });
  if (kind === "delete") expect(await actions.deleteProjectImage("alpha")).toEqual({ ok: true });
  expect(db.projects[0]).toMatchObject(kind === "name" ? { name: "After" } : { image: kind === "upload" ? fresh : null });
});
it("업로드는 커밋 뒤 이전 객체 정리가 실패해도 성공을 유지한다", async () => {
  h.del.mockRejectedValue(new Error("blob down"));
  expect(await actions.uploadProjectImage(form())).toEqual({ ok: true });
  expect(db.projects[0]).toMatchObject({ image: fresh });
});

it("이미 없는 이미지는 삭제 사건을 만들지 않는다", async () => {
  Object.assign(db.projects[0]!, { image: null });
  expect(await actions.deleteProjectImage("alpha")).toEqual({ ok: true });
  expect(db.projectEvents).toHaveLength(0);
});
