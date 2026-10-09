import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/components/signin/dot-field", () => ({ DotField: () => null }));
import Page from "../page";

/**
 * **동의문의 방침 링크** (self-hosting design §7). self-hosted의 `/privacy`는 운영자 페이지로 나가므로, 로그인 흐름 한가운데서 같은 탭을
 * 떠나지 않게 새 탭으로 연다(DESIGN §6.3 외부 링크 새 탭). hosted는 그대로 같은 탭이다.
 */
afterEach(() => { vi.unstubAllEnvs(); });

const privacyAnchor = async () => {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  // 푸터에도 `/privacy` 링크가 있다 — 동의문 링크는 본문 링크 형(`text-link`)이다.
  return [...html.matchAll(/<a[^>]*href="\/privacy"[^>]*>/g)].map((m) => m[0]).find((a) => a.includes("text-link"));
};

it("hosted — 같은 탭", async () => {
  const anchor = await privacyAnchor();
  expect(anchor).toBeDefined();
  expect(anchor).not.toContain("target=");
});

it("self-hosted — 새 탭 + noopener noreferrer", async () => {
  vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
  vi.stubEnv("VERCEL_ENV", "");
  const anchor = await privacyAnchor();
  expect(anchor).toContain('target="_blank"');
  expect(anchor).toContain('rel="noopener noreferrer"');
});
