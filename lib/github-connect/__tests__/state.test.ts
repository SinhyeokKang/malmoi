import { describe, expect, it } from "vitest";

import { signState, verifyState } from "../state";

/**
 * OAuth state 서명·검증 (design §3.1·§4). **I/O가 없다** — nonce 생성과 쿠키 쓰기는 껍데기가 하고,
 * 여기서는 서명·대조·만료만 판정한다. `secret`을 인자로 받는 것이 그 조건이다: 함수 안에서
 * `requireEnv("AUTH_SECRET")`을 부르면 순수가 아니고 이 테스트가 환경변수를 요구하게 된다.
 *
 * ⚠️ **state는 쿠키와 쿼리 양쪽에 있어야 한다.** 쿼리만 보면 CSRF이고, 쿠키만 보면 GitHub이
 * 돌려주는 값과 대조할 것이 없다. 그래서 쿠키가 서명된 payload를 들고 쿼리가 nonce만 든다.
 *
 * ⚠️ **목적지 slug는 쿠키에서 온다.** GitHub이 돌려주는 쿼리에서 읽으면 공격자가 목적지를 정한다.
 */

const SECRET = "test-secret-0123456789abcdef";
const NOW = new Date("2026-09-06T00:00:00.000Z");
const EXPIRES = new Date("2026-09-06T00:10:00.000Z");

function sign(over: Partial<Parameters<typeof signState>[0]> = {}): string {
  return signState({
    userId: "user-1",
    slug: "acme",
    nonce: "nonce-1",
    expiresAt: EXPIRES,
    secret: SECRET,
    ...over,
  });
}

function verify(over: Partial<Parameters<typeof verifyState>[0]> = {}) {
  return verifyState({
    cookie: sign(),
    query: "nonce-1",
    userId: "user-1",
    now: NOW,
    secret: SECRET,
    ...over,
  });
}

describe("signState — 결정적이고 payload를 그대로 들고 있다", () => {
  it("같은 입력이면 같은 문자열이다 — 쿠키 값이 요청마다 흔들리면 대조가 불가능하다", () => {
    expect(sign()).toBe(sign());
  });

  it("slug가 다르면 다른 서명이다", () => {
    expect(sign({ slug: "acme" })).not.toBe(sign({ slug: "other" }));
  });

  it("secret이 다르면 다른 서명이다 — 서명이 실제로 secret을 쓴다", () => {
    expect(sign({ secret: SECRET })).not.toBe(sign({ secret: `${SECRET}x` }));
  });
});

describe("verifyState — 정상 왕복", () => {
  it("쿠키와 쿼리의 nonce가 같고 서명·만료·사용자가 맞으면 ok이고 slug를 준다", () => {
    expect(verify()).toEqual({ status: "ok", slug: "acme" });
  });

  it("slug는 **쿠키에서** 온다 — 쿼리에 무엇이 오든 목적지는 서명된 값이다", () => {
    const cookie = sign({ slug: "signed-slug" });
    expect(verify({ cookie, query: "nonce-1" })).toEqual({ status: "ok", slug: "signed-slug" });
  });
});

describe("verifyState — state-mismatch (대조할 것이 없거나 서명이 안 맞다)", () => {
  it("쿠키가 없으면 state-mismatch다 — 없음을 통과로 읽지 않는다 (fail-closed)", () => {
    expect(verify({ cookie: null })).toEqual({ status: "state-mismatch" });
    expect(verify({ cookie: undefined })).toEqual({ status: "state-mismatch" });
    expect(verify({ cookie: "" })).toEqual({ status: "state-mismatch" });
  });

  it("쿼리 nonce가 없거나 다르면 state-mismatch다 — CSRF 방어의 본체다", () => {
    expect(verify({ query: null })).toEqual({ status: "state-mismatch" });
    expect(verify({ query: undefined })).toEqual({ status: "state-mismatch" });
    expect(verify({ query: "nonce-2" })).toEqual({ status: "state-mismatch" });
  });

  it("secret이 다르면 state-mismatch다 — 남이 만든 쿠키는 통과하지 못한다", () => {
    expect(verify({ cookie: sign({ secret: "attacker-secret" }) })).toEqual({
      status: "state-mismatch",
    });
  });

  it("쿠키 문자열을 한 글자만 바꿔도 state-mismatch다", () => {
    const cookie = sign();
    const mutated = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`;
    expect(verify({ cookie: mutated })).toEqual({ status: "state-mismatch" });
  });

  it("쿠키가 서명 형태가 아니면 state-mismatch다 — 파싱 실패로 던지지 않는다", () => {
    for (const cookie of ["garbage", "a.b.c", "....", "eyJhIjoxfQ"]) {
      expect(verify({ cookie })).toEqual({ status: "state-mismatch" });
    }
  });

  it("payload를 바꾸고 서명을 그대로 두면 state-mismatch다 — 서명 대상이 payload 전체다", () => {
    // ⚠️ 이 케이스만 인코딩 형태(`<base64url(JSON)>.<서명>`)에 의존한다. 그 결합을 감수하는 이유는
    // "서명을 재사용한 payload 교체"가 이 함수가 막아야 하는 유일한 실제 공격이기 때문이다.
    const cookie = sign({ slug: "acme" });
    const dot = cookie.lastIndexOf(".");
    const payload = cookie.slice(0, dot);
    const signature = cookie.slice(dot + 1);
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(decoded).toMatchObject({ userId: "user-1", slug: "acme", nonce: "nonce-1" });

    const forged = Buffer.from(
      JSON.stringify({ ...(decoded as Record<string, unknown>), slug: "victim" }),
      "utf8",
    ).toString("base64url");
    expect(verify({ cookie: `${forged}.${signature}` })).toEqual({ status: "state-mismatch" });
  });
});

describe("verifyState — state-expired / wrong-user", () => {
  it("만료 시각 정각은 이미 만료다 — 유효 구간을 만료 이전까지로 닫는다", () => {
    expect(verify({ now: EXPIRES })).toEqual({ status: "state-expired" });
  });

  it("만료 1ms 전은 통과한다", () => {
    expect(verify({ now: new Date(EXPIRES.getTime() - 1) })).toEqual({ status: "ok", slug: "acme" });
  });

  it("세션이 바뀐 채 돌아온 callback은 wrong-user다 — 같은 브라우저에서 계정을 갈아탄 경우", () => {
    expect(verify({ userId: "user-2" })).toEqual({ status: "wrong-user" });
  });

  it("만료가 wrong-user보다 앞이다 — 만료된 state가 누구 것이었는지 말하지 않는다", () => {
    // `planInvitationAccept`가 만료를 이메일 대조보다 앞에 둔 것과 같은 축이다.
    expect(verify({ now: EXPIRES, userId: "user-2" })).toEqual({ status: "state-expired" });
  });

  it("서명 검사가 만료·사용자 검사보다 앞이다 — 위조된 쿠키의 내용은 읽을 가치가 없다", () => {
    const forged = sign({ secret: "attacker-secret", userId: "user-2", expiresAt: NOW });
    expect(verify({ cookie: forged, now: EXPIRES, userId: "user-2" })).toEqual({
      status: "state-mismatch",
    });
  });
});
