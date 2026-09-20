import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ putImage: vi.fn(), deleteImage: vi.fn(), listImages: vi.fn(), requireEnv: vi.fn(), disconnect: vi.fn(), users: vi.fn(), projects: vi.fn() }));
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("@/lib/env", () => ({ requireEnv: mocks.requireEnv }));
vi.mock("@/lib/upload/store", () => mocks);
vi.mock("@/lib/credentials/storage", () => ({ validatePiiReadKeys: vi.fn() }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class { $disconnect = mocks.disconnect; user = { findMany: mocks.users }; project = { findMany: mocks.projects }; } }));
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


it("두 접두를 훑고 참조 중 프로젝트 이미지는 고아에서 뺀다", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(bytes)).mockResolvedValueOnce(new Response(null, { status: 404 })));
  const host = "https://store.public.blob.vercel-storage.com/";
  mocks.users.mockResolvedValue([]);
  mocks.projects.mockResolvedValue([{ image: host + "projects/p/used.webp" }]);
  mocks.listImages.mockImplementation(async (prefix: string) => (prefix === "avatars/" ? ["avatars/u/orphan.webp"] : ["projects/p/used.webp", "projects/p/orphan.webp"]).map(pathname => ({ pathname, url: host + pathname })));
  await import("../../../scripts/smoke-blob");
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalled());
  expect(mocks.listImages).toHaveBeenCalledWith("avatars/");
  expect(mocks.listImages).toHaveBeenCalledWith("projects/");
  const report = log.mock.calls.find(([value]) => typeof value === "string" && value.includes("orphanCandidates"));
  expect(JSON.parse(String(report?.[0])).orphanCandidates).toEqual(["avatars/u/orphan.webp", "projects/p/orphan.webp"]);
  expect(mocks.deleteImage).toHaveBeenCalledTimes(1);
});
