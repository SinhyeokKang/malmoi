import { describe, expect, it } from "vitest";

import { colorSchemeCookieSpec, serializeCookieSpec } from "../cookie-spec";
import { COLOR_SCHEME_COOKIE } from "../scheme";

const ONE_YEAR = 60 * 60 * 24 * 365;

describe("colorSchemeCookieSpec — 쿠키 속성의 유일한 출처", () => {
  it("http-only · lax · path / · 1년이고 secure는 인자다", () => {
    expect(colorSchemeCookieSpec("dark", true)).toEqual({
      name: COLOR_SCHEME_COOKIE,
      value: "dark",
      options: { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: ONE_YEAR },
    });
    expect(colorSchemeCookieSpec("light", false).options.secure).toBe(false);
  });
});

describe("serializeCookieSpec", () => {
  it("Set-Cookie 한 줄로 직렬화한다", () => {
    expect(serializeCookieSpec(colorSchemeCookieSpec("dark", true))).toBe(
      `${COLOR_SCHEME_COOKIE}=dark; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`,
    );
  });

  it("secure가 아니면 Secure를 붙이지 않는다", () => {
    expect(serializeCookieSpec(colorSchemeCookieSpec("system", false))).not.toContain("Secure");
  });
});
