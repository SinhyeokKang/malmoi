import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeUser, encodeUserFields } from "@/lib/credentials/records";
import { uploadProfileImage, deleteProfileImage } from "../actions";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), putImage: vi.fn(), deleteImage: vi.fn(), revalidatePath: vi.fn(), getPrisma: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/upload/store", () => ({ putImage: mocks.putImage, deleteImage: mocks.deleteImage }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
const oldUrl = "https://store.public.blob.vercel-storage.com/avatars/owner/old.png";
const newUrl = "https://store.public.blob.vercel-storage.com/avatars/owner/new.png";
let row: { id: string; image?: string | null };
let tx: { $executeRaw: ReturnType<typeof vi.fn>; user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
function form(bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)) {
  const data = new FormData(); data.set("image", new File([bytes], "fake.svg", { type: "image/svg+xml" })); data.set("userId", "victim"); return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  row = { id: "owner", ...encodeUserFields("owner", { image: oldUrl }) };
  tx = { $executeRaw: vi.fn(), user: { findUniqueOrThrow: vi.fn(async () => row), update: vi.fn(async ({ data }) => { row = { ...row, ...data }; return row; }) } };
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.getPrisma.mockReturnValue({ $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) });
  mocks.putImage.mockResolvedValue(newUrl);
  mocks.deleteImage.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it.each(["signin", "unavailable"])("인증 실패 %s는 저장 전에 끝난다", async (reason) => {
  mocks.requireUser.mockRejectedValue(new Error(reason));
  await expect(uploadProfileImage(form())).rejects.toThrow(reason);
  await expect(deleteProfileImage()).rejects.toThrow(reason);
  expect(mocks.putImage).not.toHaveBeenCalled(); expect(mocks.getPrisma).not.toHaveBeenCalled();
});
it("문자열과 누락 파일은 값으로 거부한다", async () => {
  const data = new FormData();
  expect(await uploadProfileImage(data)).toEqual({ ok: false, reason: "not-a-file" });
  data.set("image", "pretend-file");
  expect(await uploadProfileImage(data)).toEqual({ ok: false, reason: "not-a-file" });
  expect(mocks.putImage).not.toHaveBeenCalled();
});
it("빈 파일, 형식, 크기는 저장 전에 값으로 거부한다", async () => {
  expect(await uploadProfileImage(form(new Uint8Array()))).toEqual({ ok: false, reason: "empty" });
  expect(await uploadProfileImage(form(new TextEncoder().encode("<svg/>")))).toEqual({ ok: false, reason: "unsupported-type" });
  expect(await uploadProfileImage(form(new Uint8Array(800_001)))).toEqual({ ok: false, reason: "too-large" });
  expect(mocks.putImage).not.toHaveBeenCalled();
});
it("주입된 userId를 무시하고 세션 행을 잠가 봉투로 저장한 뒤 이전 파일을 정리한다", async () => {
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  expect(tx.$executeRaw.mock.calls[0]![0].join("?")).toContain('WHERE "id" = ? FOR UPDATE');
  expect(tx.$executeRaw.mock.calls[0]!.slice(1)).toEqual(["owner"]);
  expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "owner" }, select: { id: true, image: true } });
  expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { image: expect.stringMatching(/^enc:v1:/) } });
  expect(decodeUser(row).image).toBe(newUrl);
  expect(mocks.deleteImage).toHaveBeenCalledWith("avatars/owner/old.png");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("이전 파일 삭제 실패는 저장 성공을 바꾸지 않으며 URL 없이 기록한다", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.deleteImage.mockRejectedValue(new Error(oldUrl));
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  expect(warn).toHaveBeenCalled(); expect(JSON.stringify(warn.mock.calls)).not.toContain(oldUrl);
});
it("DB 쓰기 또는 커밋 실패는 새 파일만 정리한다", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getPrisma.mockReturnValue({ $transaction: async (fn: (t: typeof tx) => unknown) => { await fn(tx); throw new Error("commit failed"); } });
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(mocks.deleteImage).toHaveBeenCalledExactlyOnceWith("avatars/owner/new.png");
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("삭제는 null을 저장하고 같은 레이아웃을 무효화한다", async () => {
  expect(await deleteProfileImage()).toEqual({ ok: true });
  expect(row.image).toBeNull();
  expect(mocks.deleteImage).toHaveBeenCalledWith("avatars/owner/old.png");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("복호 불가한 이전 이미지도 교체하고 알 수 없는 파일은 지우지 않는다", async () => {
  row.image = "enc:v1:lost:bad";
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});
it("provider 이미지 삭제는 DB만 비운다", async () => {
  row = { id: "owner", ...encodeUserFields("owner", { image: "https://lh3.googleusercontent.com/a/1" }) };
  expect(await deleteProfileImage()).toEqual({ ok: true });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});
