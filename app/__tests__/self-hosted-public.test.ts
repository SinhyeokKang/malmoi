import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import middleware from "../../middleware";

/**
 * **self-hosted 공개 응답의 배선** (self-hosting design §7, SH-12/13). 판정은 `lib/seo/__tests__/public-response.test.ts`가 들고, 여기는
 * middleware·`/privacy`·루트 레이아웃이 그 판정을 **실제로 부르는지**만 본다.
 */

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), redirect: nav.redirect, notFound: nav.notFound }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("@/lib/i18n/server", async () => ({ getMessages: async () => (await import("@/messages/en")).en, getUiLocale: async () => "en" }));

const selfHosted = (extra: Record<string, string> = {}) => {
  vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
  vi.stubEnv("VERCEL_ENV", "");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
};
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const run = (path: string) => middleware(new NextRequest(`http://localhost${path}`));

describe("middleware", () => {
  it.each(["/sitemap.xml", "/llms.txt", "/llms-full.txt"])("hosted %s — 그대로 통과(정적 산출물)", (path) => {
    const response = run(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("hosted 페이지에 noindex를 붙이지 않는다", () => {
    expect(run("/").headers.get("x-robots-tag")).toBeNull();
  });

  it.each(["/sitemap.xml", "/llms.txt", "/llms-full.txt"])("self-hosted %s — 404", (path) => {
    selfHosted();
    expect(run(path).status).toBe(404);
  });

  it.each(["/", "/docs", "/signin", "/privacy"])("self-hosted 페이지 %s — noindex + CSP는 그대로", (path) => {
    selfHosted();
    const response = run(path);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("content-security-policy")).toContain("nonce-");
  });
});

describe("/privacy", () => {
  const privacy = async () => (await import("@/app/privacy/page")).default();

  it("self-hosted — 운영자 정책으로 임시 redirect", async () => {
    selfHosted({ MALMOI_PRIVACY_URL: "https://example.com/policy" });
    await expect(privacy()).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirect).toHaveBeenCalledWith("https://example.com/policy");
  });

  it("self-hosted인데 URL이 없으면 hosted 방침을 그리지 않고 404", async () => {
    selfHosted();
    await expect(privacy()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("hosted — redirect하지 않고 그린다", async () => {
    vi.stubEnv("MALMOI_PRIVACY_URL", "https://example.com/policy");
    await expect(privacy()).resolves.toBeDefined();
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️ **Analytics 판정은 서버 레이아웃에 있어야 한다** — `components/analytics.tsx`는 클라이언트 컴포넌트라 `MALMOI_ORIGIN`이 늘
 * `undefined`이고, 거기서 판정하면 self-hosted에서도 항상 렌더된다(design §7). async 서버 레이아웃은 jsdom으로 못 그려 소스로 고정한다.
 */
describe("Analytics 판정 위치", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const analytics = readFileSync("components/analytics.tsx", "utf8");

  it("루트 레이아웃이 analyticsEnabled(deploymentMode())로 SiteAnalytics를 감싼다", () => {
    expect(layout).toMatch(/analyticsEnabled\(deploymentMode\(\)\)\s*&&\s*<SiteAnalytics \/>/);
    expect(layout.match(/<SiteAnalytics \/>/g)).toHaveLength(1);
  });

  it("클라이언트 래퍼는 배포 모드를 판정하지 않는다", () => {
    expect(analytics).toContain('"use client"');
    expect(analytics).not.toMatch(/deploymentMode|analyticsEnabled|MALMOI_ORIGIN/);
  });
});
