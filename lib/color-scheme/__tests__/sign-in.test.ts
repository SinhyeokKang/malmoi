import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLOR_SCHEME_COOKIE } from "../scheme";

const h = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ user: { findUnique: h.findUnique } }) }));

const { recordColorSchemeAtSignIn, withColorSchemeSync } = await import("../sign-in");

const ONE_YEAR = 60 * 60 * 24 * 365;
const THEME = `${COLOR_SCHEME_COOKIE}=dark; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`;

/** Auth.js 형 응답 — 삭제 쿠키(`Max-Age=0`)와 세션 쿠키가 든 302. */
const AUTH_COOKIES = [
  "__Secure-authjs.pkce.code_verifier=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=lax",
  "__Secure-authjs.session-token=tok; Path=/; Expires=Tue, 06 Oct 2026 14:00:00 GMT; HttpOnly; Secure; SameSite=lax",
];
function authResponse(): Response {
  const headers = new Headers({ location: "https://x/projects" });
  for (const c of AUTH_COOKIES) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}
function request(cookie?: string, proto: string | null = "https"): Request & { cookies: { get(name: string): { value: string } | undefined } } {
  const headers = new Headers(proto === null ? {} : { "x-forwarded-proto": proto });
  if (cookie !== undefined) headers.set("cookie", cookie);
  const req = new Request("https://x/api/auth/callback/github", { headers });
  return Object.assign(req, {
    cookies: { get: (name: string) => (cookie?.startsWith(`${name}=`) ? { value: cookie.slice(name.length + 1) } : undefined) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({ colorScheme: "dark" });
});

describe("withColorSchemeSync — 응답 헤더에 한 줄만 보탠다", () => {
  it("기존 Set-Cookie를 바이트 그대로 두고 테마 쿠키를 뒤에 붙인다 (Max-Age=0 삭제 포함)", async () => {
    const res = await withColorSchemeSync(request(), async () => {
      await recordColorSchemeAtSignIn("u1");
      return authResponse();
    });
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { colorScheme: true } });
    expect(res.headers.getSetCookie()).toEqual([...AUTH_COOKIES, THEME]);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://x/projects");
  });

  it.each([null, "sepia", "__proto__"])("계정 값이 %s면 헤더가 그대로다", async (value) => {
    h.findUnique.mockResolvedValue({ colorScheme: value });
    const inner = authResponse();
    const res = await withColorSchemeSync(request(), async () => {
      await recordColorSchemeAtSignIn("u1");
      return inner;
    });
    expect(res).toBe(inner);
  });

  it("요청 쿠키가 이미 같은 값이면 쓰지 않는다", async () => {
    const inner = authResponse();
    const res = await withColorSchemeSync(request(`${COLOR_SCHEME_COOKIE}=dark`), async () => {
      await recordColorSchemeAtSignIn("u1");
      return inner;
    });
    expect(res).toBe(inner);
  });

  it("요청 쿠키가 다른 값이면 덮어쓴다", async () => {
    const res = await withColorSchemeSync(request(`${COLOR_SCHEME_COOKIE}=light`), async () => {
      await recordColorSchemeAtSignIn("u1");
      return authResponse();
    });
    expect(res.headers.getSetCookie().at(-1)).toBe(THEME);
  });

  it("http 요청이면 Secure를 붙이지 않는다", async () => {
    const res = await withColorSchemeSync(request(undefined, "http"), async () => {
      await recordColorSchemeAtSignIn("u1");
      return authResponse();
    });
    expect(res.headers.getSetCookie().at(-1)).not.toContain("Secure");
  });

  it("로그인이 아닌 요청(기록 없음)은 응답을 건드리지 않고 DB도 안 읽는다", async () => {
    const inner = authResponse();
    expect(await withColorSchemeSync(request(), async () => inner)).toBe(inner);
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it("조회가 던져도 로그인을 막지 않는다 — 응답은 그대로", async () => {
    h.findUnique.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inner = authResponse();
    const res = await withColorSchemeSync(request(), async () => {
      await recordColorSchemeAtSignIn("u1");
      return inner;
    });
    expect(res).toBe(inner);
  });

  it("래퍼 밖에서 기록해도 던지지 않는다", async () => {
    await expect(recordColorSchemeAtSignIn("u1")).resolves.toBeUndefined();
  });
});
