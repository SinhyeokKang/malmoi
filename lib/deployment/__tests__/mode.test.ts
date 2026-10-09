import { afterEach, describe, expect, it, vi } from "vitest";

import { deploymentMode, fallbackOrigin, HOSTED_PREVIEW_ORIGIN, HOSTED_PRODUCTION_ORIGIN, parseOrigin, resolveDeploymentMode } from "../mode";

/**
 * 배포 모드 판정 (self-hosting design §2). **`MALMOI_ORIGIN`이 있으면 self-hosted이고, 판정이 무효면 아무도 origin을 만들지 않는다.**
 * 판정은 사유 코드로 단언한다 — 메시지 문자열을 고쳐도 분류가 흔들리지 않게(POSTMORTEM 2026-09-08).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseOrigin — HTTPS origin만, 정규화 경계는 design §2", () => {
  it("끝 슬래시·대문자 host·기본 포트 :443을 정규화한다", () => {
    expect(parseOrigin("https://malmoi.example.com/")).toEqual({ ok: true, origin: "https://malmoi.example.com", host: "malmoi.example.com" });
    expect(parseOrigin("https://Malmoi.EXAMPLE.com")).toEqual({ ok: true, origin: "https://malmoi.example.com", host: "malmoi.example.com" });
    expect(parseOrigin("https://malmoi.example.com:443")).toEqual({ ok: true, origin: "https://malmoi.example.com", host: "malmoi.example.com" });
  });

  it("비기본 포트는 유지한다", () => {
    expect(parseOrigin("https://malmoi.example.com:8443")).toEqual({ ok: true, origin: "https://malmoi.example.com:8443", host: "malmoi.example.com:8443" });
  });

  it.each([
    ["http://malmoi.example.com", "not-https"],
    ["ftp://malmoi.example.com", "not-https"],
    ["https://user:pw@malmoi.example.com", "userinfo"],
    ["https://user@malmoi.example.com", "userinfo"],
    ["https://malmoi.example.com/malmoi", "path"],
    ["https://malmoi.example.com//", "path"],
    ["https://malmoi.example.com/?x=1", "query"],
    ["https://malmoi.example.com?", "query"],
    ["https://malmoi.example.com#top", "fragment"],
    ["https://malmoi.example.com/#", "fragment"],
    ["https://[::1]", "ipv6"],
    ["https://[2001:db8::1]:8443", "ipv6"],
    ["https://말모이.example.com", "idn"],
    ["https://xn--9t4b11yi5a.example.com", "idn"],
    ["malmoi.example.com", "malformed"],
    ["https://", "malformed"],
    ["https://malmoi example.com", "malformed"],
    [" https://malmoi.example.com", "malformed"],
    ["https://malmoi_example.com", "malformed"],
  ] as const)("%s → %s", (raw, reason) => {
    expect(parseOrigin(raw)).toEqual({ ok: false, reason });
  });
});

describe("resolveDeploymentMode — 존재가 모드, 동시 존재·형식 밖은 무효", () => {
  it("MALMOI_ORIGIN이 없으면 hosted다 — VERCEL_ENV는 그대로 싣는다", () => {
    expect(resolveDeploymentMode({})).toEqual({ kind: "hosted", vercelEnv: undefined });
    expect(resolveDeploymentMode({ VERCEL_ENV: "production" })).toEqual({ kind: "hosted", vercelEnv: "production" });
    expect(resolveDeploymentMode({ VERCEL_ENV: "preview" })).toEqual({ kind: "hosted", vercelEnv: "preview" });
  });

  it("빈 문자열·공백은 미설정이다 — 두 변수 모두", () => {
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "" })).toEqual({ kind: "hosted", vercelEnv: undefined });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "   " })).toEqual({ kind: "hosted", vercelEnv: undefined });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "\t\n" , VERCEL_ENV: " " })).toEqual({ kind: "hosted", vercelEnv: undefined });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "https://malmoi.example.com", VERCEL_ENV: "" })).toEqual({
      kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com",
    });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "https://malmoi.example.com", VERCEL_ENV: "  " }).kind).toBe("self-hosted");
  });

  it("MALMOI_ORIGIN이 맞으면 self-hosted이고 정규화한 origin을 싣는다", () => {
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "https://Malmoi.Example.com/" })).toEqual({
      kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com",
    });
  });

  it("VERCEL_ENV와 함께 있으면 무효다 — Vercel env에 넣어도 self-hosted로 조용히 돌지 않는다", () => {
    for (const vercelEnv of ["production", "preview", "development", "anything"]) {
      expect(resolveDeploymentMode({ MALMOI_ORIGIN: "https://malmoi.example.com", VERCEL_ENV: vercelEnv })).toEqual({ kind: "invalid", reason: "vercel-env-present" });
    }
  });

  it("형식 밖이면 무효이고 사유는 파서의 것이다", () => {
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "http://malmoi.example.com" })).toEqual({ kind: "invalid", reason: "not-https" });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "https://malmoi.example.com/sub" })).toEqual({ kind: "invalid", reason: "path" });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "htps:/oops" })).toEqual({ kind: "invalid", reason: "not-https" });
    expect(resolveDeploymentMode({ MALMOI_ORIGIN: "oops" })).toEqual({ kind: "invalid", reason: "malformed" });
  });
});

describe("deploymentMode — 지연 getter가 process.env를 호출 시점에 읽는다", () => {
  it("모듈을 다시 읽지 않아도 env 변경을 따른다", () => {
    vi.stubEnv("MALMOI_ORIGIN", "");
    vi.stubEnv("VERCEL_ENV", "");
    expect(deploymentMode().kind).toBe("hosted");
    vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
    expect(deploymentMode()).toEqual({ kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com" });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(deploymentMode()).toEqual({ kind: "invalid", reason: "vercel-env-present" });
  });
});

describe("hosted 리터럴과 fallback origin", () => {
  it("hosted 도메인은 두 상수다", () => {
    expect(HOSTED_PRODUCTION_ORIGIN).toBe("https://mal-moi.com");
    expect(HOSTED_PREVIEW_ORIGIN).toBe("https://dev.mal-moi.com");
  });

  it("fallback은 hosted면 프로덕션, self-hosted면 설정 origin, 무효면 없다 — self-hosted가 SaaS로 떨어지지 않는다", () => {
    expect(fallbackOrigin({ kind: "hosted", vercelEnv: "preview" })).toBe("https://mal-moi.com");
    expect(fallbackOrigin({ kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com" })).toBe("https://malmoi.example.com");
    expect(fallbackOrigin({ kind: "invalid", reason: "vercel-env-present" })).toBeNull();
  });
});
