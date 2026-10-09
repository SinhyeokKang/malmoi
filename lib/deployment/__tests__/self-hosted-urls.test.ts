import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callbackUrl, isAllowedHost, requestOrigin } from "@/lib/github-connect/origin";
import { checkOrigin } from "@/lib/mcp/http";
import { oauthEndpoint } from "@/lib/oauth/endpoint";
import { renderProjectWorkflowYaml, renderSurfaceWorkflowStep, workflowApiUrl } from "@/lib/onboarding/workflow";

/**
 * **self-hosted에서 URL을 만드는 자리가 설정 origin 하나만 낸다** (self-hosting design §2). 요청 헤더는 조작할 수 있고, 이 값이
 * `redirect_uri`·OAuth issuer·남의 리포 CI가 push 토큰을 보낼 곳이 된다 — hosted 도메인(`mal-moi.com`)이 한 번이라도 나오면
 * self-hosted 사용자의 토큰이 SaaS로 간다.
 */

const ORIGIN = "https://malmoi.example.com";
const HOST = "malmoi.example.com";

afterEach(() => {
  vi.unstubAllEnvs();
});

const surface = { surfaceSlug: "web", pathTemplate: "web/{locale}.json", adapter: "json-catalog" as const, baseLocale: "en" };

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("self-hosted — 설정 호스트만 정확히 받는다", () => {
  beforeEach(() => {
    vi.stubEnv("MALMOI_ORIGIN", ORIGIN);
    vi.stubEnv("VERCEL_ENV", "");
  });

  it("설정 호스트면 설정 origin이고 secure다 — x-forwarded-proto는 보지 않는다", () => {
    for (const forwardedProto of ["https", "http", null, "http,https"]) {
      expect(requestOrigin({ host: HOST, forwardedProto })).toEqual({ origin: ORIGIN, secure: true });
    }
    expect(requestOrigin({ host: "Malmoi.Example.com", forwardedProto: "http" })).toEqual({ origin: ORIGIN, secure: true });
  });

  it("다른 호스트는 hosted·로컬이어도 null이다 — LOCAL_HOST가 꺼진다", () => {
    for (const host of ["mal-moi.com", "dev.mal-moi.com", "localhost:3000", "127.0.0.1:3000", "evil.com", "sub.malmoi.example.com", "malmoi.example.com.evil.com", "malmoi.example.com:8443", "", null]) {
      expect(requestOrigin({ host, forwardedProto: "https" }), String(host)).toBeNull();
    }
  });

  it("isAllowedHost도 같은 판정이다 — MCP Origin 대조가 SaaS·로컬 호스트를 받지 않는다", () => {
    expect(isAllowedHost(HOST)).toBe(true);
    for (const host of ["mal-moi.com", "dev.mal-moi.com", "localhost:3000", "evil.com"]) expect(isAllowedHost(host), host).toBe(false);
    expect(checkOrigin(headers({ origin: ORIGIN }))).toBe(true);
    expect(checkOrigin(headers({ origin: "https://mal-moi.com" }))).toBe(false);
    expect(checkOrigin(headers({ origin: "http://localhost:3000" }))).toBe(false);
  });

  it("위조 Host·X-Forwarded-*에도 OAuth issuer·resource는 설정 origin만이다", () => {
    expect(oauthEndpoint(headers({ host: HOST, "x-forwarded-proto": "http", "x-forwarded-host": "evil.com" }))).toEqual({ issuer: ORIGIN, resource: `${ORIGIN}/api/mcp` });
    expect(oauthEndpoint(headers({ host: "evil.com", "x-forwarded-host": HOST, "x-forwarded-proto": "https" }))).toBeNull();
    expect(oauthEndpoint(headers({ host: "mal-moi.com", "x-forwarded-proto": "https" }))).toBeNull();
    expect(callbackUrl(requestOrigin({ host: HOST, forwardedProto: null })!.origin)).toBe(`${ORIGIN}/api/github/callback`);
  });

  it("workflow에는 api-url 줄이 항상 있다 — 입력 origin이 없거나 hosted여도 설정 origin이다", () => {
    for (const origin of [ORIGIN, null, undefined, "https://mal-moi.com", "https://evil.com"]) {
      expect(workflowApiUrl(origin), String(origin)).toBe(ORIGIN);
    }
    const yaml = renderProjectWorkflowYaml({ slug: "order-check", baseBranch: "main", surfaces: [surface], apiUrl: workflowApiUrl(null) });
    expect(yaml.split("\n").filter((line) => line === `          api-url: ${JSON.stringify(ORIGIN)}`)).toHaveLength(1);
    expect(yaml).not.toContain("mal-moi.com/");
    expect(yaml).not.toMatch(/https:\/\/(dev\.)?mal-moi\.com/);
  });
});

describe("판정이 무효면 아무 URL도 만들지 않는다", () => {
  it.each([
    ["VERCEL_ENV 동시 존재", { MALMOI_ORIGIN: ORIGIN, VERCEL_ENV: "production" }],
    ["MALMOI_ORIGIN 형식 밖", { MALMOI_ORIGIN: "http://malmoi.example.com", VERCEL_ENV: "" }],
  ])("%s", (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    for (const host of [HOST, "mal-moi.com", "localhost:3000"]) {
      expect(requestOrigin({ host, forwardedProto: "https" }), host).toBeNull();
      expect(isAllowedHost(host), host).toBe(false);
    }
    expect(oauthEndpoint(headers({ host: "mal-moi.com", "x-forwarded-proto": "https" }))).toBeNull();
    // 줄을 생략하면 action 기본값(hosted)으로 토큰이 간다 — 생략이 아니라 렌더 거부다.
    expect(() => workflowApiUrl(ORIGIN)).toThrow();
    expect(() => workflowApiUrl(null)).toThrow();
  });
});

describe("hosted는 그대로다 — MALMOI_ORIGIN이 비어 있으면", () => {
  it("빈 문자열·공백 MALMOI_ORIGIN은 미설정이다", () => {
    for (const blank of ["", "   "]) {
      vi.stubEnv("MALMOI_ORIGIN", blank);
      expect(requestOrigin({ host: "mal-moi.com", forwardedProto: "https" })).toEqual({ origin: "https://mal-moi.com", secure: true });
      expect(requestOrigin({ host: "localhost:3000", forwardedProto: null })).toEqual({ origin: "http://localhost:3000", secure: false });
      expect(workflowApiUrl("https://mal-moi.com")).toBeUndefined();
      expect(workflowApiUrl("https://dev.mal-moi.com")).toBe("https://dev.mal-moi.com");
      expect(renderSurfaceWorkflowStep({ slug: "x", ...surface })).not.toContain("api-url");
    }
  });
});
