import { beforeEach, describe, expect, it, vi } from "vitest";

import { UI_LOCALE_COOKIE } from "../locales";

const h = vi.hoisted(() => ({ set: vi.fn(), proto: "https" as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: h.set }),
  headers: async () => new Headers(h.proto === null ? {} : { "x-forwarded-proto": h.proto }),
}));

const { setUiLocaleCookie } = await import("../cookie");

beforeEach(() => {
  vi.clearAllMocks();
  h.proto = "https";
});

describe("setUiLocaleCookie", () => {
  it("http-only · lax · 1년 · path / — secure는 x-forwarded-proto 앞 값이 정한다", async () => {
    h.proto = "https,http";
    await setUiLocaleCookie("ko");
    expect(h.set).toHaveBeenCalledWith(UI_LOCALE_COOKIE, "ko", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  });

  it("http면 secure가 아니다", async () => {
    h.proto = "http";
    await setUiLocaleCookie("es");
    expect(h.set).toHaveBeenCalledWith(UI_LOCALE_COOKIE, "es", expect.objectContaining({ secure: false }));
  });
});
