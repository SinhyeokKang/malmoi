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
