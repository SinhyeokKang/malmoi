import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **업로드 이미지 읽기 프록시** (`GET /api/images/[...key]`, 2026-09-28).
 *
 * ⚠️ **rewrite가 아니라 Route Handler인 이유가 이 파일의 존재 이유다.** Next의 외부 rewrite는 요청 헤더를
 * 상류로 그대로 넘긴다 — 실측에서 `cookie: __Secure-authjs.session-token=…`과 `authorization: Bearer …`가
 * 상류에 도착했다. `<img src="/api/images/…">`는 동일 출처라 브라우저가 세션 쿠키를 붙이고, 이 앱은 **DB
 * 세션**이라 그 토큰이 곧 계정 접근이다. 여기서는 `readImage`가 **헤더를 하나도 안 넘긴다.**
 *
 * 이 파일이 지키는 것:
 *
 * 1. **allowlist 밖 키·호스트 미설정은 fetch를 아예 안 한다** — 요청의 어떤 바이트도 상류에 안 닿는다.
 * 2. **상류 실패를 중계하지 않는다** — Blob의 404 본문은 XML/HTML이고, 그걸 `<img>`가 받으면
 *    `naturalWidth === 0` 폴백에 흔적 없이 떨어진다. 우리는 **빈 404**만 낸다.
 * 3. **content-type은 검증된 확장자에서 온다** — 상류 헤더를 믿지 않는다.
 * 4. **브라우저·CDN 캐시 헤더 둘 다 있다** — Route Handler는 기본 동적이라 `Cache-Control`만으로는
 *    CDN에 안 앉는다.
 */

vi.mock("server-only", () => ({}));

const { GET } = await import("../images/[...key]/route");

const BLOB = "store.public.blob.vercel-storage.com";
const BYTES = Uint8Array.of(82, 73, 70, 70);

let fetchMock: ReturnType<typeof vi.fn>;

function upstream(init: { ok?: boolean; status?: number; type?: string | null; body?: string }): Response {
  const headers = new Headers();
  if (init.type !== null) headers.set("content-type", init.type ?? "image/webp");
  return new Response(init.ok === false ? (init.body ?? "<Error>NoSuchKey</Error>") : BYTES, {
    status: init.status ?? (init.ok === false ? 404 : 200),
    headers,
  });
}

async function call(key: string[], search = ""): Promise<Response> {
  const path = key.map((part) => encodeURIComponent(part)).join("/");
  return GET(new Request(`https://mal-moi.com/api/images/${path}${search}`), { params: Promise.resolve({ key }) });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => upstream({}));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BLOB_PUBLIC_HOST", BLOB);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("상류에 닿기 전에 막는다", () => {
  it.each([
    [["other", "u1", "n1.webp"]],
    [["avatars", "..", "..", "n1.webp"]],
    [["avatars", "u1", "n1.webp", "extra"]],
    [["avatars", "u1", "n1.svg"]],
    [["avatars", "u1"]],
  ])("allowlist 밖 %s는 404이고 fetch가 0회다", async (key) => {
    const response = await call(key);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "evil.test", "https://store.public.blob.vercel-storage.com", "*.public.blob.vercel-storage.com"])(
    "`BLOB_PUBLIC_HOST`가 %s면 404이고 fetch가 0회다 — fail-closed",
    async (host) => {
      vi.stubEnv("BLOB_PUBLIC_HOST", host);
      expect((await call(["avatars", "u1", "n1.webp"])).status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  /**
   * **한 객체에 URL은 하나여야 한다** — 쿼리스트링을 막는 것과 같은 축이다. `URL`은 `pathname`을
   * 디코드하지 않으므로 다르게 적힌 같은 키가 여기서 갈린다. 통과시키면 철자마다 CDN 캐시 항목이
   * 하나씩 생긴다. ⚠️ **allowlist는 `isStoredImageKey`가 이미 했다** — 이 검사는 캐시 키 전용이다.
   */
  it.each([
    // 접두를 다르게 적은 같은 키.
    ["/api/images/%61vatars/u1/n1.webp", ["avatars", "u1", "n1.webp"]],
    // 세그먼트 안에 인코딩된 구분자 — Next가 디코드해 이어 붙이면 같은 키가 된다.
    ["/api/images/avatars/u1%2Fn1.webp", ["avatars", "u1/n1.webp"]],
    ["/api/images/avatars/u1/n1%2Ewebp", ["avatars", "u1", "n1.webp"]],
  ])("다르게 적힌 같은 키 %s는 404이고 fetch가 0회다", async (pathname, key) => {
    const response = await GET(new Request(`https://mal-moi.com${pathname}`), { params: Promise.resolve({ key }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("표준 철자는 그대로 200이다 — 검사가 정상 경로를 막지 않는다", async () => {
    const response = await GET(
      new Request("https://mal-moi.com/api/images/avatars/u1/n1.webp"),
      { params: Promise.resolve({ key: ["avatars", "u1", "n1.webp"] }) },
    );
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://${BLOB}/avatars/u1/n1.webp`);
  });

  /** 쿼리는 CDN 캐시 키를 쪼갠다 — 같은 객체를 무한히 다른 키로 만들면 이 경로가 증폭기가 된다. */
  it("쿼리가 붙으면 404이고 fetch가 0회다", async () => {
    expect((await call(["avatars", "u1", "n1.webp"], "?w=1")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("상류 응답", () => {
  it("성공하면 바이트를 그대로 싣고 캐시 헤더 둘을 낸다", async () => {
    const response = await call(["avatars", "u1", "n1.webp"]);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("cdn-cache-control")).toBe("public, s-maxage=86400");
    // 캐시 가능해야 한다 — 세션을 읽지 않으므로 둘 다 없다.
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
  });

  it("우리 출처의 검증된 호스트 하나만 부르고, 헤더는 넘기지 않는다", async () => {
    await call(["projects", "p1", "n1.png"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://${BLOB}/projects/p1/n1.png`);
    expect(init.headers).toBeUndefined();
    // 상류 302는 임의 호스트로 가는 두 번째 길이다.
    expect(init.redirect).toBe("error");
  });

  it("content-type은 상류가 아니라 검증된 확장자에서 온다", async () => {
    fetchMock.mockResolvedValue(upstream({ type: "image/gif" }));
    expect((await call(["avatars", "u1", "n1.webp"])).headers.get("content-type")).toBe("image/webp");
  });

  it("상류가 비-OK면 상태도 본문도 중계하지 않는다 — 빈 404다", async () => {
    fetchMock.mockResolvedValue(upstream({ ok: false, status: 403, type: "application/xml", body: "<Error>AccessDenied</Error>" }));
    const response = await call(["avatars", "u1", "n1.webp"]);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it.each(["text/html", "application/xml", null])("상류 content-type이 %s면 404다", async (type) => {
    fetchMock.mockResolvedValue(upstream({ type }));
    expect((await call(["avatars", "u1", "n1.webp"])).status).toBe(404);
  });

  it("상류가 던지면 404다 — 오류가 새지 않는다", async () => {
    fetchMock.mockRejectedValue(new Error("upstream boom"));
    const response = await call(["avatars", "u1", "n1.webp"]);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  /** 키·URL·상류 원문은 로그에도 안 남는다 — 남의 메시지를 싣지 않는 규칙이 `lib/failure.ts`와 같다. */
  it("로그에 키·URL·상류 오류 원문이 없다", async () => {
    fetchMock.mockRejectedValue(new Error("upstream boom"));
    await call(["avatars", "u1", "n1.webp"]);
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().map((v) => JSON.stringify(v)).join(" ");
    expect(logged).not.toContain("avatars/u1");
    expect(logged).not.toContain(BLOB);
    expect(logged).not.toContain("upstream boom");
  });
});

 it("본문 스트림이 실패해도 빈 404다", async () => {
   const response = upstream({});
   vi.spyOn(response, "arrayBuffer").mockRejectedValue(new Error("body failed"));
   fetchMock.mockResolvedValue(response);
   const result = await call(["avatars", "u1", "n1.webp"]);
   expect(result.status).toBe(404);
   expect(await result.text()).toBe("");
 });
