// @vitest-environment jsdom
import { createElement as h } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { AuthLayout } from "@/components/signin/auth-layout";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * **슬로건 셋은 화면 언어를 탄다** (user-timezone T9 — T7의 en 고정을 되돌렸다) — 랜딩 h1·하단 제목·signin 우측 문구.
 * 사전 값 그대로 렌더되고 `lang` 속성은 없다(문서 언어가 곧 화면 언어).
 */
const mocks = vi.hoisted(() => ({ m: null as unknown }));
vi.mock("@/lib/i18n/server", () => ({ getMessages: async () => mocks.m, getUiLocale: async () => "ko" }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "none" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: vi.fn() }));

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => vi.unstubAllGlobals());

describe.each([["ko", ko], ["es", es]] as const)("%s 랜딩", (_code, dict) => {
  it("h1·하단 h2는 사전 값, lang 속성 없음", async () => {
    mocks.m = dict;
    const { default: Root } = await import("@/app/page");
    const { container } = await render(await Root());
    const h1 = container.querySelector("h1")!;
    expect(h1.textContent).toBe(dict.landing.hero.title.join(""));
    expect(h1.textContent).not.toBe(en.landing.hero.title.join(""));
    expect(h1.hasAttribute("lang")).toBe(false);
    const h2 = container.querySelector("h2#landing-closing")!;
    expect(h2.textContent).toBe(dict.landing.closing.title);
    expect(h2.textContent).not.toBe(en.landing.closing.title);
    expect(h2.hasAttribute("lang")).toBe(false);
    expect(container.textContent).toContain(dict.landing.hero.body);
    expect(container.textContent).toContain(dict.landing.closing.body);
    expect(dict.landing.hero.body).not.toBe(en.landing.hero.body);
  });

  it("signin 우측 장식 문구는 사전 값, lang 속성 없음", async () => {
    const { container } = await render(h(AuthLayout, { m: dict, decoration: true, children: h("div") }));
    expect(container.querySelector("p[lang]")).toBeNull();
    const text = container.textContent ?? "";
    expect(text).toContain(dict.signIn.hero.top);
    expect(text).toContain(dict.signIn.hero.bottom);
    expect(dict.signIn.hero.top).not.toBe(en.signIn.hero.top);
  });
});
