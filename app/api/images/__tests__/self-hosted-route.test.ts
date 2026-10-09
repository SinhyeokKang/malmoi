import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **self-hosted에서 기존 이미지 route 둘이 볼륨을 읽는다** (self-hosting design §3) — 새 route는 없다. 키 검증·정규 철자·쿼리 거부는
 * hosted와 같은 줄을 지나고(`app/api/__tests__/images-route.test.ts`), 다른 것은 바이트의 출처뿐이다.
 *
 * ⚠️ **어떤 읽기 실패도 본문 없는 404다** — reject가 route 밖으로 새면 Next가 500 본문을 낸다(POSTMORTEM 2026-10-07 부류).
 * ⚠️ **상류 fetch가 0회다** — 볼륨 모드에서 Blob 호스트를 부르면 운영자 설정과 무관한 남의 호스트를 읽는다.
 */

const image = await import("../[...key]/route");
const email = await import("../email/[...key]/route");

const asRoot = process.getuid?.() === 0;
const ORIGIN = "https://malmoi.example.com";
let base: string;
let root: string;
let WEBP: Uint8Array;
const fetchMock = vi.fn();

function call(route: typeof image, prefix: string, key: string): Promise<Response> {
  return route.GET(new Request(`${ORIGIN}${prefix}${key}`), { params: Promise.resolve({ key: key.split("/") }) });
}

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), "images-self-hosted-"));
  root = join(base, "uploads");
  mkdirSync(join(root, "projects", "p1"), { recursive: true });
  WEBP = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 4, background: "#3b82f6" } }).webp().toBuffer());
  writeFileSync(join(root, "projects", "p1", "n1.webp"), WEBP);
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("MALMOI_ORIGIN", ORIGIN);
  vi.stubEnv("MALMOI_UPLOAD_DIR", root);
  vi.stubEnv("BLOB_PUBLIC_HOST", "store.public.blob.vercel-storage.com");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  chmodSync(join(root, "projects", "p1"), 0o755);
  rmSync(base, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("/api/images/[...key]", () => {
  it("볼륨의 바이트를 검증된 확장자 MIME으로 낸다", async () => {
    const response = await call(image, "/api/images/", "projects/p1/n1.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(WEBP);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("없는 키는 본문 없는 404다", async () => {
    const response = await call(image, "/api/images/", "projects/p1/missing.webp");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("볼륨 밖을 가리키는 symlink는 404다", async () => {
    writeFileSync(join(base, "secret.webp"), WEBP);
    symlinkSync(join(base, "secret.webp"), join(root, "projects", "p1", "n2.webp"));
    expect((await call(image, "/api/images/", "projects/p1/n2.webp")).status).toBe(404);
  });

  it.skipIf(asRoot)("읽기 reject(권한 없음)도 404다 — route 밖으로 던지지 않는다", async () => {
    chmodSync(join(root, "projects", "p1"), 0o000);
    const response = await call(image, "/api/images/", "projects/p1/n1.webp");
    expect(response.status).toBe(404);
  });

  it("업로드 디렉터리 설정이 비면 404다", async () => {
    vi.stubEnv("MALMOI_UPLOAD_DIR", "");
    expect((await call(image, "/api/images/", "projects/p1/n1.webp")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/api/images/email/[...key]", () => {
  it("볼륨의 썸네일을 PNG로 바꿔 낸다", async () => {
    const response = await call(email, "/api/images/email/", "projects/p1/n1.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("없는 키는 404다", async () => {
    expect((await call(email, "/api/images/email/", "projects/p1/missing.webp")).status).toBe(404);
  });
});
