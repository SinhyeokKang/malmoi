import sharp from "sharp";
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
const newUrl = "https://store.public.blob.vercel-storage.com/avatars/owner/new.webp";
let row: { id: string; image?: string | null };
let tx: { $executeRaw: ReturnType<typeof vi.fn>; user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
let validPng: Uint8Array<ArrayBuffer>;
function form(bytes = validPng) {
  const data = new FormData(); data.set("image", new File([bytes], "fake.svg", { type: "image/svg+xml" })); data.set("userId", "victim"); return data;
}
beforeEach(async () => {
  validPng = new Uint8Array(await sharp({ create: { width: 384, height: 192, channels: 4, background: "#ff000080" } }).png().toBuffer());
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
  expect(await uploadProfileImage(form(new Uint8Array(3_000_001)))).toEqual({ ok: false, reason: "too-large" });
  expect(mocks.putImage).not.toHaveBeenCalled();
});
it("주입된 userId를 무시하고 세션 행을 잠가 봉투로 저장한 뒤 이전 파일을 정리한다", async () => {
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  expect(tx.$executeRaw.mock.calls[0]![0].join("?")).toContain('WHERE "id" = ? FOR UPDATE');
  expect(tx.$executeRaw.mock.calls[0]!.slice(1)).toEqual(["owner"]);
  expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "owner" }, select: { id: true, image: true } });
  expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { image: expect.stringMatching(/^enc:v1:/) } });
  expect(decodeUser(row).image).toBe(newUrl);
  expect(mocks.putImage).toHaveBeenCalledWith(expect.stringMatching(/^avatars\/owner\/[A-Za-z0-9_-]+\.webp$/), expect.any(Uint8Array), "webp");
  expect(mocks.deleteImage).toHaveBeenCalledWith("avatars/owner/old.png");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("이전 파일 삭제 실패는 저장 성공을 바꾸지 않으며 URL 없이 기록한다", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.deleteImage.mockRejectedValue(new Error(oldUrl));
  expect(await uploadProfileImage(form())).toEqual({ ok: true });
  expect(warn).toHaveBeenCalledExactlyOnceWith("Profile image cleanup failed; an orphan may remain.", { userId: "owner", cause: "Error" });
  expect(JSON.stringify(warn.mock.calls)).not.toContain(oldUrl);
});
it("DB 쓰기 또는 커밋 실패는 새 파일만 정리한다", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getPrisma.mockReturnValue({ $transaction: async (fn: (t: typeof tx) => unknown) => { await fn(tx); throw new Error("commit failed"); } });
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(mocks.deleteImage).toHaveBeenCalledExactlyOnceWith("avatars/owner/new.webp");
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
it("저장소 실패는 DB를 바꾸지 않는다", async () => {
  mocks.putImage.mockRejectedValue(new Error("store failed"));
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(mocks.getPrisma).not.toHaveBeenCalled();
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});
it("삭제 DB 실패는 아직 참조하는 파일을 지우지 않는다", async () => {
  tx.user.update.mockRejectedValue(new Error("db failed"));
  expect(await deleteProfileImage()).toEqual({ ok: false, reason: "unavailable" });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("삭제 I/O가 실패해도 DB의 삭제를 유지한다", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.deleteImage.mockRejectedValue(new Error("store failed"));
  expect(await deleteProfileImage()).toEqual({ ok: true });
  expect(row.image).toBeNull();
});
it("동시 업로드는 직렬화된 이전 값을 정리하고 마지막 파일을 남긴다", async () => {
  let tail = Promise.resolve();
  mocks.getPrisma.mockReturnValue({ $transaction: async (fn: (t: typeof tx) => unknown) => {
    let unlock!: () => void;
    const before = tail; tail = new Promise<void>((resolve) => { unlock = resolve; });
    await before;
    try { return await fn(tx); } finally { unlock(); }
  } });
  const lastUrl = "https://store.public.blob.vercel-storage.com/avatars/owner/last.webp";
  mocks.putImage.mockResolvedValueOnce(newUrl).mockResolvedValueOnce(lastUrl);
  expect(await Promise.all([uploadProfileImage(form()), uploadProfileImage(form())])).toEqual([{ ok: true }, { ok: true }]);
  expect(decodeUser(row).image).toBe(lastUrl);
  expect(mocks.deleteImage.mock.calls.map(([key]) => key).sort()).toEqual(["avatars/owner/new.webp", "avatars/owner/old.png"]);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
});
it.each(["", "missing-key"])("PII 쓰기 키 %s가 없으면 Blob에 바이트를 보내지 않는다", async (kid) => {
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", kid);
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(mocks.putImage).not.toHaveBeenCalled();
});
it("실패 단계는 남기되 저장소 오류의 토큰과 URL은 기록하지 않는다", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.putImage.mockRejectedValue(new Error("secret-token " + oldUrl));
  expect(await uploadProfileImage(form())).toEqual({ ok: false, reason: "unavailable" });
  expect(error).toHaveBeenCalledWith("Profile image upload failed.", { stage: "blob-upload", userId: "owner", cause: "Error" });
  expect(JSON.stringify(error.mock.calls)).not.toContain("secret-token");
  expect(JSON.stringify(error.mock.calls)).not.toContain(oldUrl);
});
it("삭제 DB 실패도 안전한 단계 로그를 남긴다", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  tx.user.update.mockRejectedValue(new Error("private database URL"));
  expect(await deleteProfileImage()).toEqual({ ok: false, reason: "unavailable" });
  expect(error).toHaveBeenCalledWith("Profile image deletion failed.", { stage: "database-update", userId: "owner", cause: "Error" });
});
it("자기 행에 다른 사용자 URL이 들어 있어도 다른 사용자의 파일을 삭제하지 않는다", async () => {
  row = { id: "owner", ...encodeUserFields("owner", { image: "https://store.public.blob.vercel-storage.com/avatars/victim/old.png" }) };
  expect(await deleteProfileImage()).toEqual({ ok: true });
  expect(mocks.deleteImage).not.toHaveBeenCalled();
});

it("3MB 원본을 받아 Blob에는 축소한 WebP만 보낸다", async () => {
  const bytes = new Uint8Array(3_000_000); bytes.set(validPng);
  expect(await uploadProfileImage(form(bytes))).toEqual({ ok: true });
  const uploaded = mocks.putImage.mock.calls[0]![1] as Uint8Array;
  expect(uploaded.length).toBeLessThan(validPng.length);
  expect(await sharp(uploaded).metadata()).toMatchObject({ format: "webp", width: 192, height: 96, hasAlpha: true });
});
it("시그니처만 있는 손상 파일은 Blob과 DB에 닿지 않는다", async () => {
  expect(await uploadProfileImage(form(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)))).toEqual({ ok: false, reason: "unsupported-type" });
  expect(mocks.putImage).not.toHaveBeenCalled();
  expect(mocks.getPrisma).not.toHaveBeenCalled();
});
/**
 * ⚠️ **커밋 뒤에 도는 것은 성공 여부를 못 바꾼다** (POSTMORTEM 2026-09-20 🔁 — 프로젝트 쪽 셋이 이
 * 파일을 베껴 같은 결함을 물려받았고, 전수 grep이 원본인 여기를 찾아냈다). 이전 객체 정리와 캐시
 * 갱신은 tx가 **끝난 뒤** 도므로, 그 예외가 Action 밖으로 나가면 화면이 저장된 사진을 "실패"로 말하고
 * 사용자가 다시 올려 **두 번째 Blob 객체**를 만든다.
 */
it.each(["upload", "delete"])("%s는 커밋 뒤 캐시 실패를 저장 실패로 보고하지 않는다", async kind => {
  mocks.revalidatePath.mockImplementationOnce(() => { throw new Error("cache failure"); });
  expect(await (kind === "upload" ? uploadProfileImage(form()) : deleteProfileImage())).toEqual({ ok: true });
  expect(decodeUser(row)?.image ?? null).toBe(kind === "upload" ? newUrl : null);
});
it.each(["upload", "delete"])("%s는 커밋 뒤 이전 객체 정리가 실패해도 성공을 유지한다", async kind => {
  mocks.deleteImage.mockRejectedValue(new Error("blob down"));
  expect(await (kind === "upload" ? uploadProfileImage(form()) : deleteProfileImage())).toEqual({ ok: true });
  expect(decodeUser(row)?.image ?? null).toBe(kind === "upload" ? newUrl : null);
});
