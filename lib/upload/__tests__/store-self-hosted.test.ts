import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MissingEnvError } from "@/lib/failure";

import { deleteImage, putImage, readImage } from "../store";

/**
 * **저장 경계가 배포 모드로 고른다** (self-hosting design §3) — hosted는 Vercel Blob, self-hosted는 `MALMOI_UPLOAD_DIR` 볼륨.
 * 소비자(`putImage`·`readImage`·`deleteImage`)의 시그니처는 그대로다. ⚠️ **self-hosted가 Blob SDK·상류 fetch에 닿으면 red다** —
 * 운영자 볼륨의 이미지가 남의 스토어로 나가거나, 남의 호스트를 읽게 된다.
 */

const sdk = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn(), list: vi.fn() }));
vi.mock("@vercel/blob", () => sdk);

let root: string;
const fetchMock = vi.fn();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "store-self-hosted-"));
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
  vi.stubEnv("MALMOI_UPLOAD_DIR", root);
  // 지금 판정이 hosted로 새면 쓰기 토큰이 있어 조용히 Blob으로 간다 — 그 갈래를 일부러 열어 둔다.
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  vi.stubEnv("BLOB_PUBLIC_HOST", "store.public.blob.vercel-storage.com");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("self-hosted", () => {
  it("쓰기는 볼륨에 두고 상대 경로를 돌려준다 — DB에 그 값이 저장된다", async () => {
    expect(await putImage("avatars/u1/n1.webp", Uint8Array.of(1, 2), "webp")).toBe("/api/images/avatars/u1/n1.webp");
    expect([...readFileSync(join(root, "avatars/u1/n1.webp"))]).toEqual([1, 2]);
  });

  it("읽기·삭제도 볼륨이다", async () => {
    await putImage("projects/p1/n1.webp", Uint8Array.of(5), "webp");
    expect([...new Uint8Array((await readImage("projects/p1/n1.webp"))!)]).toEqual([5]);
    await deleteImage("projects/p1/n1.webp");
    expect(await readImage("projects/p1/n1.webp")).toBeNull();
  });

  it("Blob SDK와 상류 fetch에 한 번도 닿지 않는다", async () => {
    await putImage("avatars/u1/n1.webp", Uint8Array.of(1), "webp");
    await readImage("avatars/u1/n1.webp");
    await readImage("avatars/u1/missing.webp");
    await deleteImage("avatars/u1/n1.webp");
    expect(sdk.put).not.toHaveBeenCalled();
    expect(sdk.del).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("업로드 디렉터리가 없으면 쓰기는 설정 누락을 던지고 읽기는 null이다", async () => {
    vi.stubEnv("MALMOI_UPLOAD_DIR", "");
    await expect(putImage("avatars/u1/n1.webp", Uint8Array.of(1), "webp")).rejects.toBeInstanceOf(MissingEnvError);
    await expect(deleteImage("avatars/u1/n1.webp")).rejects.toBeInstanceOf(MissingEnvError);
    expect(await readImage("avatars/u1/n1.webp")).toBeNull();
    expect(sdk.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("무효 모드는 어느 저장소에도 닿지 않는다", () => {
  it("VERCEL_ENV와 MALMOI_ORIGIN이 함께면 쓰기·삭제는 던지고 읽기는 null이다", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(putImage("avatars/u1/n1.webp", Uint8Array.of(1), "webp")).rejects.toThrow();
    await expect(deleteImage("avatars/u1/n1.webp")).rejects.toThrow();
    expect(await readImage("avatars/u1/n1.webp")).toBeNull();
    expect(sdk.put).not.toHaveBeenCalled();
    expect(sdk.del).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hosted는 그대로 Blob이다", () => {
  it("MALMOI_ORIGIN이 없으면 Blob SDK로 쓴다", async () => {
    vi.stubEnv("MALMOI_ORIGIN", "");
    sdk.put.mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/avatars/u1/n1.webp" });
    expect(await putImage("avatars/u1/n1.webp", Uint8Array.of(1), "webp")).toBe("https://store.public.blob.vercel-storage.com/avatars/u1/n1.webp");
    expect(sdk.put).toHaveBeenCalledTimes(1);
  });
});
