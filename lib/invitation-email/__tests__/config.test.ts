import { describe, expect, it } from "vitest";

import { readInvitationEmailConfig } from "../config";

/**
 * 메일 설정 판정 (design §5). **설정이 없거나 틀리면 발급·발송만 막는다** — 던지지 않는다(부팅·로그인과 무관).
 *
 * origin은 환경과 대조한다: 프로덕션 `https://mal-moi.com`, preview `https://dev.mal-moi.com`,
 * 그 밖(로컬)은 localhost/127.0.0.1만. 요청 Host로 링크를 만들지 않는 것이 요지다.
 */

const prod = {
  VERCEL_ENV: "production",
  RESEND_API_KEY: "re_test_key",
  INVITATION_EMAIL_FROM: "malmoi <invite@notify.mal-moi.com>",
  INVITATION_EMAIL_ORIGIN: "https://mal-moi.com",
};

describe("readInvitationEmailConfig — ready", () => {
  it("프로덕션 값이 다 맞으면 ready다", () => {
    expect(readInvitationEmailConfig(prod)).toEqual({
      status: "ready",
      apiKey: "re_test_key",
      from: "malmoi <invite@notify.mal-moi.com>",
      origin: "https://mal-moi.com",
    });
  });

  it("preview는 dev.mal-moi.com이다", () => {
    expect(
      readInvitationEmailConfig({ ...prod, VERCEL_ENV: "preview", INVITATION_EMAIL_ORIGIN: "https://dev.mal-moi.com" })
        .status,
    ).toBe("ready");
  });

  it("로컬은 localhost·127.0.0.1을 포트와 함께 허용한다", () => {
    const local = { ...prod, VERCEL_ENV: undefined };
    expect(readInvitationEmailConfig({ ...local, INVITATION_EMAIL_ORIGIN: "http://localhost:3000" }).status).toBe("ready");
    expect(readInvitationEmailConfig({ ...local, INVITATION_EMAIL_ORIGIN: "http://127.0.0.1:3001" }).status).toBe("ready");
  });

  it("주소만 있는 발신자도 받는다", () => {
    expect(readInvitationEmailConfig({ ...prod, INVITATION_EMAIL_FROM: "invite@notify.mal-moi.com" }).status).toBe(
      "ready",
    );
  });
});

describe("readInvitationEmailConfig — 누락", () => {
  for (const name of ["RESEND_API_KEY", "INVITATION_EMAIL_FROM", "INVITATION_EMAIL_ORIGIN"] as const) {
    it(`${name}가 없으면 missing이다`, () => {
      expect(readInvitationEmailConfig({ ...prod, [name]: undefined })).toEqual({
        status: "unavailable",
        reason: "missing",
      });
    });

    it(`${name}가 빈 문자열이어도 missing이다`, () => {
      expect(readInvitationEmailConfig({ ...prod, [name]: "" })).toEqual({ status: "unavailable", reason: "missing" });
    });
  }

  it("로컬 기본값(전부 미설정)은 발송하지 않는다", () => {
    expect(readInvitationEmailConfig({})).toEqual({ status: "unavailable", reason: "missing" });
  });
});

describe("readInvitationEmailConfig — 잘못된 값", () => {
  it.each([
    "https://mal-moi.com/",
    "https://mal-moi.com/invite",
    "https://mal-moi.com?x=1",
    "https://mal-moi.com#frag",
    "https://user:pw@mal-moi.com",
    "mal-moi.com",
    "not a url",
  ])("origin %s는 경로·query·fragment·userinfo가 붙은 값이라 거부한다", (origin) => {
    expect(readInvitationEmailConfig({ ...prod, INVITATION_EMAIL_ORIGIN: origin })).toEqual({
      status: "unavailable",
      reason: "invalid-origin",
    });
  });

  it.each(["", "malmoi", "malmoi <invite>", "<>", "a b@x.com", "malmoi\r\nBcc: x@y.com <invite@notify.mal-moi.com>"])("발신자 %j는 거부한다", (from) => {
    const result = readInvitationEmailConfig({ ...prod, INVITATION_EMAIL_FROM: from });
    expect(result.status).toBe("unavailable");
  });
});

describe("readInvitationEmailConfig — 환경 오배선", () => {
  it("프로덕션에 dev origin이면 거부한다", () => {
    expect(readInvitationEmailConfig({ ...prod, INVITATION_EMAIL_ORIGIN: "https://dev.mal-moi.com" })).toEqual({
      status: "unavailable",
      reason: "origin-mismatch",
    });
  });

  it("preview에 prod origin이면 거부한다", () => {
    expect(
      readInvitationEmailConfig({ ...prod, VERCEL_ENV: "preview", INVITATION_EMAIL_ORIGIN: "https://mal-moi.com" }),
    ).toEqual({ status: "unavailable", reason: "origin-mismatch" });
  });

  it("로컬에 prod origin이면 거부한다 — 로컬 초대가 프로덕션 링크를 보내지 않는다", () => {
    expect(readInvitationEmailConfig({ ...prod, VERCEL_ENV: undefined })).toEqual({
      status: "unavailable",
      reason: "origin-mismatch",
    });
  });

  it("프로덕션에 localhost면 거부한다", () => {
    expect(readInvitationEmailConfig({ ...prod, INVITATION_EMAIL_ORIGIN: "http://localhost:3000" })).toEqual({
      status: "unavailable",
      reason: "origin-mismatch",
    });
  });

  it("프로덕션에 http면 거부한다", () => {
    expect(readInvitationEmailConfig({ ...prod, INVITATION_EMAIL_ORIGIN: "http://mal-moi.com" })).toEqual({
      status: "unavailable",
      reason: "origin-mismatch",
    });
  });
});

/**
 * **self-hosted — origin은 `MALMOI_ORIGIN`에서 파생한다** (self-hosting design §2·§7). `INVITATION_EMAIL_ORIGIN`은 읽지 않는다 — 있으면
 * preflight가 거부하고(정본 둘 방지), 여기서는 무시한다. hosted 판정(위 describe들)은 이 갈래가 열지 않는다.
 */
describe("readInvitationEmailConfig — self-hosted", () => {
  const self = {
    MALMOI_ORIGIN: "https://malmoi.example.com",
    RESEND_API_KEY: "re_test_key",
    INVITATION_EMAIL_FROM: "Malmoi <invite@malmoi.example.com>",
  };

  it("INVITATION_EMAIL_ORIGIN 없이 ready이고 origin은 설정 origin이다", () => {
    expect(readInvitationEmailConfig(self)).toEqual({
      status: "ready",
      apiKey: "re_test_key",
      from: "Malmoi <invite@malmoi.example.com>",
      origin: "https://malmoi.example.com",
    });
  });

  it("origin은 정규화된 값이다 — 끝 슬래시·대문자·:443", () => {
    expect(readInvitationEmailConfig({ ...self, MALMOI_ORIGIN: "https://Malmoi.Example.com:443/" })).toMatchObject({ status: "ready", origin: "https://malmoi.example.com" });
    expect(readInvitationEmailConfig({ ...self, MALMOI_ORIGIN: "https://malmoi.example.com:8443" })).toMatchObject({ status: "ready", origin: "https://malmoi.example.com:8443" });
  });

  it.each(["https://mal-moi.com", "https://dev.mal-moi.com", "http://localhost:3000", "https://evil.example"])("INVITATION_EMAIL_ORIGIN %s는 읽지 않는다 — 링크는 설정 origin이다", (stray) => {
    expect(readInvitationEmailConfig({ ...self, INVITATION_EMAIL_ORIGIN: stray })).toMatchObject({ status: "ready", origin: "https://malmoi.example.com" });
  });

  it.each(["RESEND_API_KEY", "INVITATION_EMAIL_FROM"] as const)("%s가 없으면 missing이다", (name) => {
    expect(readInvitationEmailConfig({ ...self, [name]: undefined })).toEqual({ status: "unavailable", reason: "missing" });
    expect(readInvitationEmailConfig({ ...self, [name]: "" })).toEqual({ status: "unavailable", reason: "missing" });
  });

  it("발신자 모양은 hosted와 같은 규칙이다", () => {
    expect(readInvitationEmailConfig({ ...self, INVITATION_EMAIL_FROM: "malmoi <invite>" })).toEqual({ status: "unavailable", reason: "invalid-from" });
  });

  it("VERCEL_ENV와 함께면 판정 무효라 invalid-origin이다 — hosted 값으로 떨어지지 않는다", () => {
    for (const vercelEnv of ["production", "preview"]) {
      expect(readInvitationEmailConfig({ ...self, VERCEL_ENV: vercelEnv, INVITATION_EMAIL_ORIGIN: "https://mal-moi.com" })).toEqual({ status: "unavailable", reason: "invalid-origin" });
    }
  });

  it.each(["http://malmoi.example.com", "https://malmoi.example.com/app", "https://u:p@malmoi.example.com", "malmoi.example.com", "https://[::1]"])("형식 밖 MALMOI_ORIGIN %s는 invalid-origin이다", (origin) => {
    expect(readInvitationEmailConfig({ ...self, MALMOI_ORIGIN: origin })).toEqual({ status: "unavailable", reason: "invalid-origin" });
  });
});
