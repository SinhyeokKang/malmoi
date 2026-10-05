import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLOR_SCHEME_COOKIE } from "../scheme";

const h = vi.hoisted(() => ({ set: vi.fn(), proto: "https" as string | null, findUnique: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: h.set }),
  headers: async () => new Headers(h.proto === null ? {} : { "x-forwarded-proto": h.proto }),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ user: { findUnique: h.findUnique } }) }));

const { setColorSchemeCookie, syncColorSchemeCookieOnSignIn } = await import("../cookie");

const ONE_YEAR = 60 * 60 * 24 * 365;

beforeEach(() => {
  vi.clearAllMocks();
  h.proto = "https";
  h.findUnique.mockResolvedValue({ colorScheme: "dark" });
});

describe("setColorSchemeCookie", () => {
  it("http-only · lax · 1년 · path / — secure는 x-forwarded-proto 앞 값이 정한다", async () => {
    h.proto = "https,http";
    await setColorSchemeCookie("dark");
    expect(h.set).toHaveBeenCalledWith(COLOR_SCHEME_COOKIE, "dark", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: ONE_YEAR });
  });

  it("http면 secure가 아니다", async () => {
    h.proto = "http";
    await setColorSchemeCookie("light");
    expect(h.set).toHaveBeenCalledWith(COLOR_SCHEME_COOKIE, "light", expect.objectContaining({ secure: false }));
  });
});

describe("syncColorSchemeCookieOnSignIn — 로그인이 끝나면 계정 값을 기기 쿠키로", () => {
  it("계정 값이 있으면 같은 속성으로 쿠키에 쓴다", async () => {
    await syncColorSchemeCookieOnSignIn("u1");
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { colorScheme: true } });
    expect(h.set).toHaveBeenCalledWith(COLOR_SCHEME_COOKIE, "dark", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: ONE_YEAR });
  });

  it.each([null, "sepia", "__proto__"])("계정 값이 %s면 쿠키를 건드리지 않는다 — 기기 선택 보존", async (value) => {
    h.findUnique.mockResolvedValue({ colorScheme: value });
    await syncColorSchemeCookieOnSignIn("u1");
    expect(h.set).not.toHaveBeenCalled();
  });

  it("행이 없거나 조회·쓰기가 던져도 로그인을 막지 않는다", async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(syncColorSchemeCookieOnSignIn("u1")).resolves.toBeUndefined();
    h.findUnique.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(syncColorSchemeCookieOnSignIn("u1")).resolves.toBeUndefined();
    expect(h.set).not.toHaveBeenCalled();
  });
});
