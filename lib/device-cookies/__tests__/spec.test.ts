import { describe, expect, it } from "vitest";

import { COLOR_SCHEME_COOKIE } from "@/lib/color-scheme/scheme";
import { UI_LOCALE_COOKIE } from "@/lib/i18n/locales";
import { deviceCookieSpec, isSecureForwardedProto, serializeCookieSpec } from "../spec";

const ONE_YEAR = 60 * 60 * 24 * 365;

describe("deviceCookieSpec — 기기 쿠키 속성의 유일한 출처", () => {
  it("http-only · lax · path / · 1년이고 secure는 인자다", () => {
    expect(deviceCookieSpec(COLOR_SCHEME_COOKIE, "dark", true)).toEqual({
      name: COLOR_SCHEME_COOKIE,
      value: "dark",
      options: { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: ONE_YEAR },
    });
    expect(deviceCookieSpec(UI_LOCALE_COOKIE, "ko", false).options.secure).toBe(false);
  });
});

describe("isSecureForwardedProto", () => {
  it.each([["https", true], ["https,http", true], [" HTTPS ", true], ["http,https", false], ["http", false], [null, false]] as const)("%s → %s", (header, expected) => {
    expect(isSecureForwardedProto(header)).toBe(expected);
  });
});

describe("serializeCookieSpec", () => {
  it("Set-Cookie 한 줄로 직렬화한다", () => {
    expect(serializeCookieSpec(deviceCookieSpec(UI_LOCALE_COOKIE, "ko", true))).toBe(
      `${UI_LOCALE_COOKIE}=ko; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`,
    );
  });

  it("secure가 아니면 Secure를 붙이지 않는다", () => {
    expect(serializeCookieSpec(deviceCookieSpec(COLOR_SCHEME_COOKIE, "system", false))).not.toContain("Secure");
  });
});
