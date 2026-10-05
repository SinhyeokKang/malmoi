import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLOR_SCHEME_COOKIE } from "../scheme";

const h = vi.hoisted(() => ({ set: vi.fn(), proto: "https" as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: h.set }),
  headers: async () => new Headers(h.proto === null ? {} : { "x-forwarded-proto": h.proto }),
}));

const { setColorSchemeCookie } = await import("../cookie");

const ONE_YEAR = 60 * 60 * 24 * 365;

beforeEach(() => {
  vi.clearAllMocks();
  h.proto = "https";
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
