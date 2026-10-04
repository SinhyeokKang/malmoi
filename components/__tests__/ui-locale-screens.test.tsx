// @vitest-environment jsdom
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";

import { PrivacyDoc } from "@/components/privacy/privacy-doc";
import { koPrivacy } from "@/messages/ko-privacy";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { PublicShell } from "@/components/public-shell/public-shell";
import { SearchTrigger } from "@/components/search/search-trigger";
import { Sidebar } from "@/components/shell/sidebar";
import { publicAccount } from "@/lib/auth/landing";
import { utcDay } from "@/lib/utc-time";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";

import { render } from "./helpers/dom";

/**
 * **화면 단위 ko 렌더** (ui-locales E3·E4) — 공개 셸·앱 셸·프로젝트 목록 버튼·검색이 요청 언어의 사전으로 그려진다.
 * 서버 컴포넌트는 `m` prop으로, 클라이언트는 `render(…, { uiLocale: "ko" })`의 provider로 읽는다.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/projects", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: vi.fn() }));

describe("ko 화면 렌더", () => {
  it("사전이 실제로 다르다 — 아래 단언이 영어로도 통과하는 일이 없다", () => {
    expect(ko.signIn.footer.privacy).not.toBe(en.signIn.footer.privacy);
    expect(ko.common.nav.newProject).not.toBe(en.common.nav.newProject);
    expect(ko.search.label).not.toBe(en.search.label);
    expect(ko.common.nav.projects).not.toBe(en.common.nav.projects);
  });

  it("공개 셸 — 푸터·헤더가 ko 사전이다", async () => {
    const { container } = await render(h(PublicShell, { m: ko, account: publicAccount({ status: "none" }), children: h("p", null, "body") }), { uiLocale: "ko" });
    const footer = container.querySelector("footer")!;
    expect(footer.textContent).toContain(ko.signIn.footer.privacy);
    expect(footer.textContent).not.toContain(en.signIn.footer.privacy);
    expect(container.querySelector("header")?.textContent).toContain(ko.landing.shell.getStarted);
    expect(container.querySelector('button[aria-haspopup="dialog"]')?.getAttribute("aria-label")).toBe(ko.search.label);
  });

  it("방침 — 머리 시행일과 개정 이력 날짜가 같은 ko 형이다", async () => {
    const { container } = await render(h(PrivacyDoc, { m: ko, uiLocale: "ko", doc: koPrivacy }));
    expect(container.querySelector("h1")?.textContent).toBe(koPrivacy.title);
    const times = [...container.querySelectorAll("time")];
    expect(times.length).toBeGreaterThan(1);
    for (const time of times) expect(time.textContent).toBe(utcDay(new Date(time.getAttribute("datetime")!), "ko"));
  });

  it("앱 셸 사이드바 — 항목 라벨이 ko다", async () => {
    const { container } = await render(h(Sidebar, { memberships: [], userName: "Kim" }), { uiLocale: "ko" });
    expect(container.querySelector('a[href="/projects"]')?.textContent).toContain(ko.common.nav.projects);
    expect(container.textContent).not.toContain(en.common.nav.projects);
  });

  it("프로젝트 목록 — New project 버튼이 ko다", async () => {
    const { container } = await render(h(NewProjectButton, {}), { uiLocale: "ko" });
    expect(container.querySelector("a")?.textContent).toBe(ko.common.nav.newProject);
  });

  it("검색 트리거 — 접근 이름·플레이스홀더가 ko다", async () => {
    const { container } = await render(h(SearchTrigger, { account: null }), { uiLocale: "ko" });
    const trigger = container.querySelector("button")!;
    expect(trigger.getAttribute("aria-label")).toBe(ko.search.label);
    expect(trigger.textContent).toContain(ko.search.placeholder);
  });
});
