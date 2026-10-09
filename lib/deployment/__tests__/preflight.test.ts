import { describe, expect, it } from "vitest";

import { preflight, SELF_HOSTED_ENV, type UploadDirProbe } from "../preflight";

/**
 * self-hosted 기동 전 판정 (self-hosting design §2·§9). **영구 설정 결함을 일시 장애 문구로 보이게 하지 않으려고 기동 자체를 막는다.**
 * 사유 코드로 단언한다(POSTMORTEM 2026-09-08). 기동 진입 스크립트는 이 판정을 부르는 껍데기다.
 */

/** 전부 맞는 설정 — 각 사례가 한 칸만 바꾼다. 값마다 서로 다른 표지를 넣어 출력에 새는지 센다. */
const VALID: Record<string, string> = {
  MALMOI_ORIGIN: "https://malmoi.example.com",
  MALMOI_UPLOAD_DIR: "/var/lib/malmoi/uploads",
  MALMOI_PRIVACY_URL: "https://example.com/privacy",
  AUTH_URL: "https://malmoi.example.com",
  AUTH_TRUST_HOST: "true",
  AUTH_SECRET: "secret-auth-SENTINEL1",
  AUTH_GITHUB_ID: "Iv1.SENTINEL2",
  AUTH_GITHUB_SECRET: "secret-SENTINEL3",
  AUTH_GOOGLE_ID: "google-SENTINEL4",
  AUTH_GOOGLE_SECRET: "secret-SENTINEL5",
  APP_SIGNING_SECRET: "secret-SENTINEL6",
  DATABASE_URL: "postgresql://malmoi_app:pw-SENTINEL7@postgres:5432/malmoi",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----SENTINEL8",
  GITHUB_APP_CLIENT_ID: "Iv23.SENTINEL9",
  GITHUB_APP_CLIENT_SECRET: "secret-SENTINEL10",
  GITHUB_APP_SLUG: "malmoi-acme",
  CRON_SECRET: "secret-SENTINEL11",
  TOKEN_ENCRYPTION_KEYS: '{"k1":"SENTINEL12"}',
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "k1",
  PII_ENCRYPTION_KEYS: '{"p1":"SENTINEL13"}',
  PII_ENCRYPTION_ACTIVE_KEY_ID: "p1",
  EMAIL_LOOKUP_KEY: "SENTINEL14",
  EMAIL_LOOKUP_KEY_ID: "l1",
  RESEND_API_KEY: "re_SENTINEL15",
  INVITATION_EMAIL_FROM: "Acme Malmoi <invite@mail.example.com>",
};

const okDir: UploadDirProbe = () => "ok";

function reasons(env: Record<string, string | undefined>, probe: UploadDirProbe = okDir): Record<string, string> {
  const result = preflight(env, probe);
  return result.ok ? {} : Object.fromEntries(result.problems.map((p) => [p.name, p.reason]));
}

describe("preflight — 전부 있을 때만 통과한다", () => {
  it("전부 맞으면 ok", () => {
    expect(preflight(VALID, okDir)).toEqual({ ok: true });
  });

  it("선택값(OPERATOR_EMAILS)은 없어도 통과한다", () => {
    expect(VALID.OPERATOR_EMAILS).toBeUndefined();
    expect(SELF_HOSTED_ENV.OPERATOR_EMAILS).toBe("optional");
  });

  it("필수 값은 하나씩 빠지면 그 이름이 missing이다 — 빈 문자열·공백도", () => {
    const required = Object.entries(SELF_HOSTED_ENV).filter(([, kind]) => kind === "required").map(([name]) => name);
    expect(required.length).toBeGreaterThan(20);
    for (const name of required) {
      for (const blank of [undefined, "", "  "]) {
        const env = { ...VALID, [name]: blank };
        // MALMOI_ORIGIN이 빠지면 AUTH_URL 대조가 기준을 잃는다 — 그 이름만 본다.
        expect(reasons(env)[name], `${name}=${JSON.stringify(blank)}`).toBe("missing");
      }
    }
  });

  it("여러 문제를 한 번에 보고한다 — 고치고 다시 띄우기를 반복시키지 않는다", () => {
    const result = preflight({ ...VALID, RESEND_API_KEY: undefined, GITHUB_APP_SLUG: undefined }, okDir);
    expect(result.ok ? [] : result.problems.map((p) => p.name).sort()).toEqual(["GITHUB_APP_SLUG", "RESEND_API_KEY"]);
  });
});

describe("preflight — origin과 AUTH_URL", () => {
  it("MALMOI_ORIGIN 형식 오류는 파서의 사유를 싣는다", () => {
    expect(reasons({ ...VALID, MALMOI_ORIGIN: "http://malmoi.example.com", AUTH_URL: "http://malmoi.example.com" }).MALMOI_ORIGIN).toBe("not-https");
    expect(reasons({ ...VALID, MALMOI_ORIGIN: "https://malmoi.example.com/app" }).MALMOI_ORIGIN).toBe("path");
  });

  it("VERCEL_ENV가 함께 있으면 무효다", () => {
    expect(reasons({ ...VALID, VERCEL_ENV: "production" }).MALMOI_ORIGIN).toBe("vercel-env-present");
  });

  it("AUTH_URL은 끝 슬래시 정규화 뒤 MALMOI_ORIGIN과 같아야 한다", () => {
    expect(reasons({ ...VALID, AUTH_URL: "https://malmoi.example.com/" })).toEqual({});
    expect(reasons({ ...VALID, MALMOI_ORIGIN: "https://malmoi.example.com/", AUTH_URL: "https://malmoi.example.com" })).toEqual({});
    expect(reasons({ ...VALID, AUTH_URL: "https://other.example.com" }).AUTH_URL).toBe("auth-url-mismatch");
    expect(reasons({ ...VALID, AUTH_URL: "http://malmoi.example.com" }).AUTH_URL).toBe("auth-url-mismatch");
    expect(reasons({ ...VALID, AUTH_URL: "https://malmoi.example.com/api/auth" }).AUTH_URL).toBe("auth-url-mismatch");
  });

  it("AUTH_TRUST_HOST는 true만", () => {
    expect(reasons({ ...VALID, AUTH_TRUST_HOST: "false" }).AUTH_TRUST_HOST).toBe("invalid-format");
    expect(reasons({ ...VALID, AUTH_TRUST_HOST: "1" }).AUTH_TRUST_HOST).toBe("invalid-format");
  });
});

describe("preflight — 메일·App", () => {
  it("Resend는 누락·형식만 본다 — 키가 실제로 유효한지는 판정하지 않는다", () => {
    expect(reasons({ ...VALID, RESEND_API_KEY: "not-a-resend-key" }).RESEND_API_KEY).toBe("invalid-format");
    expect(reasons({ ...VALID, RESEND_API_KEY: "re_ spaced" }).RESEND_API_KEY).toBe("invalid-format");
    expect(reasons({ ...VALID, RESEND_API_KEY: "re_revokedButWellFormed" })).toEqual({});
    expect(reasons({ ...VALID, INVITATION_EMAIL_FROM: "not an address" }).INVITATION_EMAIL_FROM).toBe("invalid-format");
    expect(reasons({ ...VALID, INVITATION_EMAIL_FROM: "invite@mail.example.com" })).toEqual({});
  });

  it("INVITATION_EMAIL_ORIGIN은 있으면 거부한다 — origin 정본이 둘이 되지 않게", () => {
    expect(reasons({ ...VALID, INVITATION_EMAIL_ORIGIN: "https://malmoi.example.com" }).INVITATION_EMAIL_ORIGIN).toBe("present");
    expect(reasons({ ...VALID, INVITATION_EMAIL_ORIGIN: "" })).toEqual({});
  });

  it("GITHUB_APP_SLUG는 slug 모양이어야 한다", () => {
    expect(reasons({ ...VALID, GITHUB_APP_SLUG: "Acme App" }).GITHUB_APP_SLUG).toBe("invalid-format");
    expect(reasons({ ...VALID, GITHUB_APP_SLUG: "acme/app" }).GITHUB_APP_SLUG).toBe("invalid-format");
  });
});

describe("preflight — MALMOI_PRIVACY_URL", () => {
  it("HTTPS URL이어야 한다", () => {
    expect(reasons({ ...VALID, MALMOI_PRIVACY_URL: "http://example.com/privacy" }).MALMOI_PRIVACY_URL).toBe("not-https");
    expect(reasons({ ...VALID, MALMOI_PRIVACY_URL: "example.com/privacy" }).MALMOI_PRIVACY_URL).toBe("malformed");
  });

  it.each([
    "https://malmoi.example.com/privacy",
    "https://malmoi.example.com/privacy/",
    "https://malmoi.example.com/privacy?x=1",
    "https://malmoi.example.com/privacy#top",
    "https://MALMOI.example.com/privacy",
    "https://malmoi.example.com:443/privacy",
  ])("자기 /privacy로 순환하면 거부한다 — %s", (url) => {
    expect(reasons({ ...VALID, MALMOI_PRIVACY_URL: url }).MALMOI_PRIVACY_URL).toBe("privacy-cycle");
  });

  it("같은 호스트의 다른 경로나 다른 origin의 /privacy는 순환이 아니다", () => {
    expect(reasons({ ...VALID, MALMOI_PRIVACY_URL: "https://example.com/privacy" })).toEqual({});
    expect(reasons({ ...VALID, MALMOI_PRIVACY_URL: "https://malmoi.example.com:8443/privacy" })).toEqual({});
  });
});

describe("preflight — MALMOI_UPLOAD_DIR", () => {
  it("상대 경로는 probe 전에 거부한다", () => {
    let probed = false;
    const probe: UploadDirProbe = () => { probed = true; return "ok"; };
    expect(reasons({ ...VALID, MALMOI_UPLOAD_DIR: "uploads" }, probe).MALMOI_UPLOAD_DIR).toBe("relative-path");
    expect(reasons({ ...VALID, MALMOI_UPLOAD_DIR: "./uploads" }, probe).MALMOI_UPLOAD_DIR).toBe("relative-path");
    expect(probed).toBe(false);
  });

  it("probe 결과를 사유로 싣는다 — 부재·쓰기 불가", () => {
    expect(reasons(VALID, () => "missing").MALMOI_UPLOAD_DIR).toBe("not-found");
    expect(reasons(VALID, () => "not-writable").MALMOI_UPLOAD_DIR).toBe("not-writable");
  });

  it("probe는 설정한 경로를 받는다", () => {
    const seen: string[] = [];
    preflight(VALID, (path) => { seen.push(path); return "ok"; });
    expect(seen).toEqual(["/var/lib/malmoi/uploads"]);
  });
});

describe("preflight — 출력에 비밀 값이 없다", () => {
  it("모든 칸을 틀리게 줘도 결과에는 이름·사유만 있다", () => {
    const broken = Object.fromEntries(Object.entries(VALID).map(([name, value]) => [name, `${value} broken`]));
    const env = { ...broken, MALMOI_ORIGIN: "https://SENTINEL0.example.com/x", INVITATION_EMAIL_ORIGIN: "https://SENTINEL16.example.com" };
    const result = preflight(env, () => "not-writable");
    expect(result.ok).toBe(false);
    const out = JSON.stringify(result);
    expect(out).not.toMatch(/SENTINEL/);
    expect(out).not.toContain("example.com");
    if (!result.ok) for (const problem of result.problems) expect(Object.keys(problem).sort()).toEqual(["name", "reason"]);
  });
});
