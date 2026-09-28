import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **초대 메일 썸네일 프록시** (`GET /api/images/email/[...key]`, 2026-09-28 — #140). `/api/images/[...key]`와 같은 검증을 지나고
 * **같은 바이트를 96×96 PNG로 바꿔** 낸다(`emailThumbnailPng`). 메일 클라이언트가 WebP 알파를 버린다.
 *
 * ⚠️ **경로가 `/api/images/` 아래인 이유는 WAF다** — 프로덕션 규칙 "Rate limit image proxy"가 `path starts with /api/images/`다.
 * ⚠️ **프로젝트 썸네일만 받는다** — 메일에 실리는 이미지는 그것 하나다. 아바타 키는 404다(읽기 경로를 넓히지 않는다).
 */

vi.mock("server-only", () => ({}));

const { GET } = await import("../images/email/[...key]/route");

const BLOB = "store.public.blob.vercel-storage.com";
let WEBP: Uint8Array<ArrayBuffer>;
let fetchMock: ReturnType<typeof vi.fn>;

async function call(key: string[], search = ""): Promise<Response> {
  return GET(new Request(`https://mal-moi.com/api/images/email/${key.join("/")}${search}`), { params: Promise.resolve({ key }) });
}

beforeEach(async () => {
  WEBP = new Uint8Array(await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 59, g: 130, b: 246, alpha: 1 } } }).webp().toBuffer());
  fetchMock = vi.fn(async () => new Response(WEBP, { status: 200, headers: { "content-type": "image/webp" } }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BLOB_PUBLIC_HOST", BLOB);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("상류에 닿기 전에 막는다", () => {
  it.each([
    [["avatars", "u1", "n1.webp"]],
    [["other", "p1", "n1.webp"]],
    [["projects", "..", "n1.webp"]],
    [["projects", "p1", "n1.svg"]],
  ])("%s는 404이고 fetch가 0회다", async (key) => {
    expect((await call(key)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("쿼리가 붙으면 404다 — 캐시 키를 쪼개지 않는다", async () => {
    expect((await call(["projects", "p1", "n1.webp"], "?w=1")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("다르게 적힌 같은 키는 404다", async () => {
    const response = await GET(new Request("https://mal-moi.com/api/images/email/%70rojects/p1/n1.webp"), { params: Promise.resolve({ key: ["projects", "p1", "n1.webp"] }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("상류 응답", () => {
  it("성공하면 96×96 PNG와 캐시 헤더 둘을 낸다", async () => {
    const response = await call(["projects", "p1", "n1.webp"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("cdn-cache-control")).toBe("public, s-maxage=86400");
    expect(response.headers.get("set-cookie")).toBeNull();
    const meta = await sharp(new Uint8Array(await response.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 96, 96]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://${BLOB}/projects/p1/n1.webp`);
    expect(init.headers).toBeUndefined();
  });

  it("상류가 비-OK면 빈 404다", async () => {
    fetchMock.mockResolvedValue(new Response("<Error/>", { status: 403, headers: { "content-type": "application/xml" } }));
    const response = await call(["projects", "p1", "n1.webp"]);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("디코드할 수 없는 바이트면 빈 404다", async () => {
    fetchMock.mockResolvedValue(new Response(Uint8Array.of(1, 2, 3), { status: 200 }));
    const response = await call(["projects", "p1", "n1.webp"]);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
