// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { find, render } from "@/components/__tests__/helpers/dom";
import { en } from "@/messages/en";
import { es } from "@/messages/es";

import PreferencesLoading from "../loading";
import PreferencesPage from "../page";

/**
 * `/preferences` (ui-locales design §5.2 — G2). 사용자 축 한 장 — `requireUser`만 지나고, 카드가 하나다(타임존·테마 자리 없음).
 */
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), uiLocale: "en" as "en" | "es" }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: vi.fn() }));
vi.mock("@/lib/i18n/server", async () => {
  const dictionaries = { en: (await import("@/messages/en")).en, es: (await import("@/messages/es")).es };
  return { getMessages: async () => dictionaries[mocks.uiLocale], getUiLocale: async () => mocks.uiLocale };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uiLocale = "en";
  mocks.requireUser.mockResolvedValue({ userId: "u1" });
});

it("로그인을 확인하고, 제목이 사이드바 라벨이며 Language 카드 하나다", async () => {
  const { container } = await render(<PreferencesPage />);
  expect(mocks.requireUser).toHaveBeenCalledTimes(1);
  expect(find(container, "h1").textContent).toBe(en.common.nav.preferences);
  const cards = container.querySelectorAll("section");
  expect(cards).toHaveLength(1);
  expect(find(cards[0]!, "h2").textContent).toBe(en.uiLocale.label);
  expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(1);
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
  expect(container.textContent).toContain(es.preferences.help);
  expect(find(container, '[role="combobox"]').textContent).toBe("Español");
});

it("골격은 낭독 한 줄만 남기고, 카드 껍데기·320 필드 자리는 실물 값이다", async () => {
  const { container } = await render(<PreferencesLoading />);
  expect(find(container, '[role="status"]').textContent).toBe(en.preferences.loading);
  // 낭독 줄 말고는 전부 aria-hidden 아래다 — 회색 블록을 스크린리더가 읽지 않는다.
  const visible = [...container.querySelectorAll("*")].filter((node) => node.children.length === 0 && node.closest('[aria-hidden="true"]') === null);
  expect(visible.map((node) => node.getAttribute("role"))).toEqual(["status"]);
  expect(container.querySelector(".rounded-lg.border .border-b.px-4.py-3")).not.toBeNull();
  expect(container.querySelector(".h-9.w-80.rounded-md")).not.toBeNull();
});
