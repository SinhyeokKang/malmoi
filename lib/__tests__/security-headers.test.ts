import { describe, expect, it } from "vitest";

import { buildCsp, cspEnvironment, securityHeaders } from "../security-headers";

/**
 * **CSP는 enforce다** (2026-09-24, audit #75 round 1 — 사용자 판정 "보안 강하게"). 정책은 환경 셋으로 갈린다:
 * 프로덕션이 기준이고, `next dev`는 React Refresh의 eval과 HMR 웹소켓을, preview는 Vercel Toolbar 호스트를 더한다.
 */
const directive = (csp: string, name: string): string[] =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("cspEnvironment", () => {
  it("dev가 VERCEL_ENV보다 앞이고, 모르는 값은 프로덕션으로 접힌다(가장 좁은 쪽)", () => {
    expect(cspEnvironment({ nodeEnv: "development", vercelEnv: "preview" })).toBe("development");
    expect(cspEnvironment({ nodeEnv: "production", vercelEnv: "preview" })).toBe("preview");
    expect(cspEnvironment({ nodeEnv: "production", vercelEnv: "production" })).toBe("production");
    expect(cspEnvironment({ nodeEnv: "production", vercelEnv: undefined })).toBe("production");
    expect(cspEnvironment({ nodeEnv: undefined, vercelEnv: "development" })).toBe("production");
  });
});

describe("buildCsp", () => {
  const prod = buildCsp("production");

  it("프로덕션 기준 지시어 — 현재 흐름이 쓰는 호스트만 연다", () => {
    expect(directive(prod, "default-src")).toEqual(["'self'"]);
    expect(directive(prod, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(prod, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(prod, "font-src")).toEqual(["'self'"]);
    expect(directive(prod, "img-src")).toEqual(["'self'", "data:", "https://avatars.githubusercontent.com", "https://lh3.googleusercontent.com", "https://*.public.blob.vercel-storage.com"]);
    expect(directive(prod, "connect-src")).toEqual(["'self'"]);
    // ⚠️ Google 로그인은 폼 POST → 302 `accounts.google.com`이다 — `form-action`은 그 리다이렉트에도 걸린다.
    expect(directive(prod, "form-action")).toEqual(["'self'", "https://github.com", "https://accounts.google.com"]);
    expect(directive(prod, "object-src")).toEqual(["'none'"]);
    expect(directive(prod, "base-uri")).toEqual(["'self'"]);
    expect(directive(prod, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("프로덕션에는 eval도 Vercel 호스트도 없다", () => {
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("vercel.live");
    expect(prod).not.toContain("pusher.com");
    expect(prod).not.toMatch(/\bws:|\bwss:/);
  });

  it("dev는 eval과 HMR 웹소켓만 더한다", () => {
    const dev = buildCsp("development");
    expect(directive(dev, "script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    expect(directive(dev, "connect-src")).toEqual(["'self'", "ws:", "wss:"]);
    expect(dev).not.toContain("vercel.live");
    expect(directive(dev, "form-action")).toEqual(directive(prod, "form-action"));
  });

  it("preview는 Vercel Toolbar 문서의 호스트를 더하고 eval은 없다", () => {
    const preview = buildCsp("preview");
    expect(preview).not.toContain("'unsafe-eval'");
    expect(directive(preview, "script-src")).toContain("https://vercel.live");
    expect(directive(preview, "connect-src")).toEqual(expect.arrayContaining(["https://vercel.live", "wss://ws-us3.pusher.com"]));
    expect(directive(preview, "img-src")).toEqual(expect.arrayContaining(["https://vercel.live", "https://vercel.com", "blob:"]));
    expect(directive(preview, "frame-src")).toEqual(["'self'", "https://vercel.live"]);
    expect(directive(preview, "style-src")).toContain("https://vercel.live");
    expect(directive(preview, "font-src")).toEqual(["'self'", "https://vercel.live", "https://assets.vercel.com"]);
    // 짝: 프로덕션 기준은 그대로 남는다.
    expect(directive(preview, "form-action")).toEqual(directive(prod, "form-action"));
    expect(directive(preview, "frame-ancestors")).toEqual(["'none'"]);
  });
});

describe("securityHeaders", () => {
  it.each(["production", "preview", "development"] as const)("%s — CSP 헤더가 정확히 하나이고 Report-Only는 없다", (env) => {
    const headers = securityHeaders(env);
    expect(headers.filter((h) => h.key.toLowerCase() === "content-security-policy")).toEqual([{ key: "Content-Security-Policy", value: buildCsp(env) }]);
    expect(headers.some((h) => h.key.toLowerCase() === "content-security-policy-report-only")).toBe(false);
  });

  it("HSTS는 하위 도메인까지 묶고 preload를 선언한다 — 목록 제출은 사람의 몫이다", () => {
    expect(securityHeaders("production").find((h) => h.key === "Strict-Transport-Security")?.value).toBe("max-age=63072000; includeSubDomains; preload");
  });
});
