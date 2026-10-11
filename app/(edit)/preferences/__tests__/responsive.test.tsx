// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";

import PreferencesLoading from "../loading";
import PreferencesPage from "../page";

/**
 * responsive-app B3 — Preferences의 고정 폭(320) 필드는 그릇보다 넓어지지 않는다(`max-w-full`). 구조·문구·Save 위치는 그대로다.
 * jsdom은 컨테이너 질의를 못 재므로 클래스 계약과 골격·실물 대응을 센다.
 */
const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/app/ui-locale/actions", () => ({ setUiLocale: vi.fn() }));
vi.mock("@/app/(edit)/preferences/actions", () => ({ setTimeZone: vi.fn(), setColorScheme: vi.fn() }));
vi.mock("@/lib/color-scheme/server", () => ({ getColorScheme: async () => "light" }));
vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

beforeEach(() => { mocks.requireUser.mockResolvedValue({ userId: "u1" }); });

it("세 카드의 Select는 320 상한 래퍼 안에서 폭을 채우고 카드 안폭보다 넓어지지 않는다", async () => {
  const { container } = await render(<PreferencesPage />);
  const triggers = [...container.querySelectorAll<HTMLElement>('[role="combobox"]')];
  expect(triggers).toHaveLength(3);
  for (const trigger of triggers) {
    // 프리미티브는 반응형 min/max를 받지 않는다(`api-contract.test.ts`) — 320 상한은 소비자 래퍼가 든다. 트리거는 그 폭을 채운다.
    expect([...trigger.classList]).toContain("w-full");
    expect([...trigger.parentElement!.classList]).toEqual(expect.arrayContaining(["flex", "w-[320px]", "max-w-full"]));
  }
});

it("골격: 카드가 컨테이너를 선언하고 머리가 실물처럼 감기며 필드는 같은 상한을 든다", async () => {
  const { container } = await render(<PreferencesLoading />);
  const cards = [...container.querySelectorAll<HTMLElement>("div.rounded-lg.border")];
  expect(cards).toHaveLength(3);
  for (const card of cards) {
    expect(card.classList.contains("@container")).toBe(true);
    const header = card.firstElementChild!;
    expect(header.classList.contains("flex-wrap")).toBe(true);
    expect([...header.lastElementChild!.classList]).toEqual(expect.arrayContaining(["ml-auto", "w-56", "@max-form:ml-0", "@max-form:w-full"]));
    expect(card.querySelector(".h-9")?.classList.contains("max-w-full")).toBe(true);
  }
});
