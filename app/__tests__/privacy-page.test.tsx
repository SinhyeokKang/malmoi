// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUnread } from "@/lib/inbox/unread-store";

import { render } from "@/components/__tests__/helpers/dom";
import type { AttentionBadgeResult, OpenAttentionInboxResult } from "@/app/inbox/actions";
import type { SessionRead } from "@/lib/auth/read-session";
import type { UiLocale } from "@/lib/i18n/locales";
import { es } from "@/messages/es";
import { koPrivacy } from "@/messages/ko-privacy";
import { en } from "@/messages/en";
import { footerLinks } from "@/lib/links";
import { routes } from "@/lib/routes";

vi.mock("@/lib/i18n/server", async () => {
  const dictionaries = { en: (await import("@/messages/en")).en, ko: (await import("@/messages/ko")).ko, es: (await import("@/messages/es")).es };
  return { getMessages: async () => dictionaries[mocks.uiLocale], getUiLocale: async () => mocks.uiLocale };
});

/**
 * **`/privacy`는 공개 셸 안에 선다** (DESIGN §6.616). 세션은 차단이 아니라 **헤더 primary 하나**를 가른다 —
 * 로그인이면 앱 셸과 같은 아바타 메뉴, 아니면(장애 포함) `Get started`.
 */
const mocks = vi.hoisted(() => ({ status: "none" as SessionRead["status"], uiLocale: "en" as UiLocale }));

vi.mock("@/lib/auth/read-session", () => ({
  readSession: async () =>
    mocks.status === "ok" ? { status: "ok", userId: "u1", name: "Ada", email: "ada@x.dev", image: null } : { status: mocks.status },
}));
// 헤더가 로그아웃 Action을 참조로 넘긴다 — 실물은 `@/auth`를 물어 jsdom에서 세울 수 없다.
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
// 로그인이면 헤더 Inbox가 마운트되어 배지 Action을 부른다 — 실물은 `getPrisma()`까지 가므로 막고, 호출 수로 페이지 배선을 센다(R-B3 🟡1).
const inbox = vi.hoisted(() => ({
  badge: vi.fn(async (): Promise<AttentionBadgeResult> => ({ status: "failed" })),
  open: vi.fn(async (): Promise<OpenAttentionInboxResult> => ({ status: "failed" })),
}));
vi.mock("@/app/inbox/actions", () => ({ loadAttentionBadgeAction: inbox.badge, openAttentionInboxAction: inbox.open }));


beforeEach(() => {
  mocks.uiLocale = "en";
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function page(status: SessionRead["status"]) {
  mocks.status = status;
  const { default: Privacy } = await import("@/app/privacy/page");
  return render(await Privacy());
}

const primary = (container: HTMLElement) => {
  const link = container.querySelector(`header a[href="${routes.signIn()}"]`);
  return [link?.textContent, link?.getAttribute("href")];
};

describe("`/privacy` — 헤더 primary가 세션으로 갈린다", () => {
  it("`ok` → 아바타 메뉴, Get started 없음", async () => {
    const { container } = await page("ok");
    expect(container.querySelector(`header button[aria-label="${en.common.nav.userMenu}"]`)).not.toBeNull();
    expect(container.querySelector(`header a[href="${routes.signIn()}"]`)).toBeNull();
  });

  it.each(["none", "unavailable"] as const)("`%s` → Get started · `/signin`", async (status) => {
    const { container } = await page(status);
    expect(primary(container)).toEqual([en.landing.shell.getStarted, routes.signIn()]);
  });

  /** 페이지가 `publicAccount`를 넘겨 헤더 Inbox가 선다 — 비로그인이면 서지 않고 배지 Action도 부르지 않는다(attention-inbox fix3). */
  it.each([["ok", 1], ["none", 0], ["unavailable", 0]] as const)("세션 `%s` → 헤더 Inbox %i개 · 배지 조회 %i회", async (status, n) => {
    inbox.badge.mockClear();
    const { container } = await page(status);
    expect(container.querySelectorAll(`header button[aria-haspopup="menu"][aria-label="${en.inbox.label}"]`)).toHaveLength(n);
    expect(inbox.badge).toHaveBeenCalledTimes(n);
  });
});

describe("`/privacy` — 공개 셸", () => {
  it("본문 랜드마크 하나 안에 방침이 서고, 헤더 링크 어느 것도 current가 아니다", async () => {
    const { container } = await page("none");
    const main = container.querySelectorAll("main");
    expect(main).toHaveLength(1);
    expect(main[0]?.querySelector("h1")?.textContent).toBe(en.publicDocs.privacy.title);
    expect(container.querySelectorAll("header [aria-current]")).toHaveLength(0);
  });

  it("푸터가 공개 셸의 링크 목록이다", async () => {
    const { container } = await page("none");
    expect([...container.querySelectorAll("footer a")].map((a) => a.getAttribute("href"))).toEqual(footerLinks(en).map(({ href }) => href));
  });
});

/**
 * **본문은 두 벌이다** (ui-locales design §8) — ko 화면은 ko 본, en·es 화면은 en 본. es 본은 원어민 검수 없이 낼 수 없어 두지 않는다.
 * 셸(헤더·푸터)은 화면 언어 그대로라 es 화면은 es 셸 + en 본문이다.
 */
describe("`/privacy` — 본문 언어", () => {
  it.each([
    ["en", en.publicDocs.privacy.title],
    ["ko", koPrivacy.title],
    ["es", en.publicDocs.privacy.title],
  ] as const)("%s 화면 → %s", async (uiLocale, title) => {
    mocks.uiLocale = uiLocale;
    const { container } = await page("none");
    expect(container.querySelector("main h1")?.textContent).toBe(title);
  });

  it("es 화면의 셸은 es다 — 본문만 en이다", async () => {
    mocks.uiLocale = "es";
    const { container } = await page("none");
    expect(container.querySelector("footer")?.textContent).toContain(es.signIn.footer.privacy);
    expect(container.querySelector("main h1")?.textContent).toBe(en.publicDocs.privacy.title);
  });

  /** WCAG 3.1.2 (R10 🟡1) — es 화면에서 영어 본문이 스페인어 음성 규칙으로 읽히지 않게 본문 그릇이 `lang="en"`을 든다. 셸 문구는 화면 언어다. */
  it.each([["en", "en"], ["ko", "ko"], ["es", "en"]] as const)("%s 화면 → 본문·목차 lang=%s, 시행일 줄·이력 날짜는 화면 언어", async (uiLocale, lang) => {
    mocks.uiLocale = uiLocale;
    const { container } = await page("none");
    const article = container.querySelector("main article");
    expect(article?.closest("[lang]")?.getAttribute("lang")).toBe(lang);
    expect(container.querySelector("main nav")?.closest("[lang]")?.getAttribute("lang")).toBe(lang);
    const times = [...container.querySelectorAll("main article time")];
    expect(times.length).toBeGreaterThan(1);
    for (const time of times) expect(time.closest("[lang]")?.getAttribute("lang")).toBe(uiLocale);
  });
});

// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2) — 헤더·사이드바를 그리는 파일은 매번 되돌린다.
afterEach(() => { setUnread(0); });
