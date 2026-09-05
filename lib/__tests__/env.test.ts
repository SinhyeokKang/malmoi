import { describe, expect, it } from "vitest";
import { optionalEnv, parsePrivateKey, requireEnv } from "../env";

describe("requireEnv", () => {
  it("값이 있으면 그대로 돌려준다", () => {
    expect(requireEnv("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("없으면 던진다 — 조용한 폴백이 설정 누락을 프로덕션까지 데려간다", () => {
    expect(() => requireEnv("FOO", {})).toThrow(/FOO/);
  });

  it("빈 문자열도 누락으로 취급한다 — Vercel에서 값을 안 채운 변수가 빈 문자열로 온다", () => {
    expect(() => requireEnv("FOO", { FOO: "" })).toThrow(/FOO/);
  });
});

describe("optionalEnv", () => {
  it("값이 있으면 그대로 돌려준다", () => {
    expect(optionalEnv("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("없으면 undefined — 던지지 않는다. 호출부가 fail-closed 판정(checkBearer)에 넘긴다", () => {
    expect(optionalEnv("FOO", {})).toBeUndefined();
  });

  it("빈 문자열도 undefined다 — Vercel이 값을 안 채운 변수를 빈 문자열로 준다", () => {
    expect(optionalEnv("FOO", { FOO: "" })).toBeUndefined();
  });
});

describe("parsePrivateKey", () => {
  it("이스케이프된 개행을 실제 개행으로 복원한다", () => {
    expect(parsePrivateKey("-----BEGIN-----\\nabc\\n-----END-----")).toBe(
      "-----BEGIN-----\nabc\n-----END-----",
    );
  });

  it("이미 실제 개행이면 건드리지 않는다 — 로컬 .env는 여러 줄로 넣을 수 있다", () => {
    const real = "-----BEGIN-----\nabc\n-----END-----";
    expect(parsePrivateKey(real)).toBe(real);
  });
});

