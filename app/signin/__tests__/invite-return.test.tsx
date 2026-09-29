import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: state.get }) }));
vi.mock("@/components/signin/dot-field", () => ({ DotField: () => null }));
import Page from "../page";

it.each(["authjs.callback-url", "__Secure-authjs.callback-url"])("%s에서 초대 복귀 링크를 만든다", async (name) => {
  state.get.mockImplementation((key: string) => key === name ? { value: encodeURIComponent("http://localhost:3000/invite/opaque-token") } : undefined);
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ error: "AccessDenied" }) }));
  expect(html).toContain('href="/invite/opaque-token"');
  expect(html).toContain("Back to invitation");
});

it.each([undefined, "/projects", "%broken", "https://example.com/path"])("초대가 아닌 쿠키 %s에는 복귀 링크가 없다", async (value) => {
  state.get.mockReturnValue(value === undefined ? undefined : { value });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  expect(html).not.toContain("Back to invitation");
  expect(html).not.toContain('href="/invite/');
});

/** mcp-oauth design §6.1 — 공급자 취소·오류로 `/signin`에 착지해도 같은 동의 요청으로 돌아갈 길이 있다(POSTMORTEM 2026-09-12). */
it("동의 화면에서 시작한 로그인은 같은 요청으로 돌아가는 링크를 만든다", async () => {
  state.get.mockImplementation((key: string) => key === "authjs.callback-url" ? { value: encodeURIComponent("http://localhost:3000/oauth/authorize?request=req_1") } : undefined);
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ error: "AccessDenied" }) }));
  expect(html).toContain('href="/oauth/authorize?request=req_1"');
  expect(html).toContain("Back to app authorization");
  expect(html).not.toContain("Back to invitation");
});
