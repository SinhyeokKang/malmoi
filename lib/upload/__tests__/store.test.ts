import { afterEach, expect, it, vi } from "vitest";
import { MissingEnvError } from "@/lib/failure";
const sdk = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn(), list: vi.fn() }));
vi.mock("@vercel/blob", () => sdk);
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("설정 없이 import되고 호출할 때 설정 누락을 던진다", async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  const { putImage } = await import("../store");
  await expect(putImage("avatars/u/n.png", Uint8Array.of(1), "png")).rejects.toBeInstanceOf(MissingEnvError);
  expect(sdk.put).not.toHaveBeenCalled();
});
it("공개 저장은 키를 바꾸지 않고 토큰과 판정된 MIME을 넘긴다", async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  sdk.put.mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/avatars/u/n.png" });
  const { putImage, deleteImage, listImages } = await import("../store");
  const bytes = Uint8Array.of(1);
  await putImage("avatars/u/n.png", bytes, "png");
  expect(sdk.put).toHaveBeenCalledWith("avatars/u/n.png", bytes, expect.objectContaining({ access: "public", addRandomSuffix: false, contentType: "image/png", token: "test-token" }));
  await deleteImage("avatars/u/n.png");
  expect(sdk.del).toHaveBeenCalledWith("avatars/u/n.png", { token: "test-token" });
  sdk.list.mockResolvedValueOnce({ blobs: [{ pathname: "avatars/u/n.png" }], hasMore: true, cursor: "next" }).mockResolvedValueOnce({ blobs: [], hasMore: false });
  expect(await listImages()).toEqual([{ pathname: "avatars/u/n.png" }]);
  expect(sdk.list).toHaveBeenLastCalledWith({ prefix: "avatars/", cursor: "next", token: "test-token" });
});
