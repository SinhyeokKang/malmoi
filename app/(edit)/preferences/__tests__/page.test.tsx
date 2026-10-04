// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { find, render } from "@/components/__tests__/helpers/dom";
import { en } from "@/messages/en";
import { es } from "@/messages/es";

import PreferencesLoading from "../loading";
import PreferencesPage from "../page";

/**
 * `/preferences` (ui-locales design §5.2 — G2 · user-timezone design §6 · color-scheme design §3.7). 사용자 축 한 장 — `requireUser`만 지나고,
 * 카드가 Language · Time zone · Theme 셋이다.
 */
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), uiLocale: "en" as "en" | "es", colorScheme: "light" as "system" | "light" | "dark" }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: vi.fn() }));
vi.mock("@/app/(edit)/preferences/actions", () => ({ setTimeZone: vi.fn(), setColorScheme: vi.fn() }));
vi.mock("@/lib/color-scheme/server", () => ({ getColorScheme: async () => mocks.colorScheme }));
vi.mock("@/lib/i18n/server", async () => {
  const dictionaries = { en: (await import("@/messages/en")).en, es: (await import("@/messages/es")).es };
  return { getMessages: async () => dictionaries[mocks.uiLocale], getUiLocale: async () => mocks.uiLocale };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uiLocale = "en";
  mocks.colorScheme = "light";
  mocks.requireUser.mockResolvedValue({ userId: "u1" });
});

it("로그인을 확인하고, 제목이 사이드바 라벨이며 Language · Time zone · Theme 카드 순이다", async () => {
  const { container } = await render(<PreferencesPage />);
  expect(mocks.requireUser).toHaveBeenCalledTimes(1);
  expect(find(container, "h1").textContent).toBe(en.common.nav.preferences);
  const cards = container.querySelectorAll("section");
  expect([...cards].map((card) => find(card, "h2").textContent)).toEqual([en.uiLocale.label, en.preferences.timeZone.title, en.preferences.theme.title]);
  expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(3);
});

it("Theme 카드의 값은 서버가 세션·쿠키로 정한 테마다", async () => {
  mocks.colorScheme = "dark";
  const { container } = await render(<PreferencesPage />);
  expect([...container.querySelectorAll('[role="combobox"]')].at(-1)?.textContent).toBe(en.preferences.theme.options.dark);
});

it("미리보기의 지금은 서버가 렌더한 순간이다 — 클라이언트가 렌더 중 시계를 읽지 않는다", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-04T23:10:00Z"), toFake: ["Date"] });
  try {
    const { container } = await render(<PreferencesPage />);
    expect(find(container, "[data-time-zone-now]").textContent).toBe(en.preferences.timeZone.now("Oct 4, 2026 23:10 UTC"));
  } finally {
    vi.useRealTimers();
  }
});

it("비로그인이면 requireUser의 redirect가 렌더를 끊는다", async () => {
  mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(PreferencesPage()).rejects.toThrow("NEXT_REDIRECT");
});

it("es 화면이면 페이지 문구가 es다", async () => {
  mocks.uiLocale = "es";
  const { container } = await render(<PreferencesPage />, { uiLocale: "es" });
  expect(find(container, "h1").textContent).toBe(es.common.nav.preferences);
  expect(find(container, "section h2").textContent).toBe(es.uiLocale.label);
  expect(container.textContent).toContain(es.preferences.timeZone.title);
  expect(container.textContent).toContain(es.preferences.help);
  expect(container.querySelector('[role="combobox"]')?.textContent).toBe("Español");
});

it("골격은 낭독 한 줄만 남기고, 카드 껍데기 셋·320 필드 자리는 실물 값이다", async () => {
  const { container } = await render(<PreferencesLoading />);
  expect(find(container, '[role="status"]').textContent).toBe(en.preferences.loading);
  // 낭독 줄 말고는 전부 aria-hidden 아래다 — 회색 블록을 스크린리더가 읽지 않는다.
  const visible = [...container.querySelectorAll("*")].filter((node) => node.children.length === 0 && node.closest('[aria-hidden="true"]') === null);
  expect(visible.map((node) => node.getAttribute("role"))).toEqual(["status"]);
  expect(container.querySelectorAll(".rounded-lg.border .border-b.px-4.py-3")).toHaveLength(3);
  expect(container.querySelectorAll(".h-9.w-80.rounded-md")).toHaveLength(3);
});
