import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ putImage: vi.fn(), deleteImage: vi.fn(), listImages: vi.fn(), requireEnv: vi.fn(), disconnect: vi.fn(), users: vi.fn() }));
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("@/lib/env", () => ({ requireEnv: mocks.requireEnv }));
vi.mock("@/lib/upload/store", () => mocks);
vi.mock("@/lib/credentials/storage", () => ({ validatePiiReadKeys: vi.fn() }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class { $disconnect = mocks.disconnect; user = { findMany: mocks.users }; } }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.requireEnv.mockReturnValue("test-only");
  mocks.putImage.mockResolvedValue("https://store.public.blob.vercel-storage.com/avatars/smoke/n.png");
});
afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("다운로드 불일치 단계가 드러나고 테스트 파일을 정리한다", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("wrong bytes")));
  await import("../../../scripts/smoke-blob");
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Blob smoke failed.", { stage: "download-verification" }));
  expect(mocks.deleteImage).toHaveBeenCalled();
  expect(mocks.disconnect).toHaveBeenCalled();
});
it("저장소 실패는 단계만 남기고 SDK의 시크릿을 버린다", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.putImage.mockRejectedValue(new Error("secret-token private URL"));
  await import("../../../scripts/smoke-blob");
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Blob smoke failed.", { stage: "blob-upload" }));
  expect(JSON.stringify(error.mock.calls)).not.toContain("secret-token");
});
