// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { input, key, render } from "./helpers/dom";

/**
 * **닫은 상세의 `event`가 다음 이동에 실려 되살아나지 않는다** (malmoi#102). 상세 닫기가 `history.replaceState`라
 * 서버가 그린 `filter` prop에는 `event`가 그대로 남는다 — 그 prop으로 다음 주소를 조립하면 필터를 바꾸거나
 * [Clear filters]를 누르는 순간 방금 닫은 상세가 다시 열렸다. 이 컨트롤들은 모달 뒤라 상세가 열린 동안에는
 * 누를 수 없으므로, 여기서 나가는 주소에는 `event`가 있을 자리가 없다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));

import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { m } from "@/lib/i18n";

const props = { slug: "alpha", sources: [{ slug: "web" }], actors: [], refreshable: true };
beforeEach(() => { mocks.push.mockReset(); });
const lastUrl = () => new URL(String(mocks.push.mock.calls.at(-1)?.[0]), "http://x");

it("종류를 고른 주소에 닫힌 상세의 `event`가 없다", async () => {
  const user = userEvent.setup();
  await render(<LogFilters {...props} filter={parseLogFilter({ event: "evt_closed" })} />);
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label^="${m.logs.filters.axis.kind}:"]`)!;
  trigger.focus();
  await act(async () => user.keyboard("{Enter}"));
  const item = [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].find((n) => n.textContent === m.logs.kinds.translations)!;
  await act(async () => user.click(item));

  expect(mocks.push).toHaveBeenCalledOnce();
  expect(lastUrl().searchParams.get("kind")).toBe("translations");
  expect(lastUrl().searchParams.has("event")).toBe(false);
});

it("검색 주소에도 `event`가 없다", async () => {
  await render(<LogFilters {...props} filter={parseLogFilter({ event: "evt_closed" })} />);
  const field = document.querySelector<HTMLInputElement>(`input[aria-label="${m.logs.search.label}"]`)!;
  await input(field, "hello");
  await key(field, "Enter");
  expect(lastUrl().searchParams.get("q")).toBe("hello");
  expect(lastUrl().searchParams.has("event")).toBe(false);
});

it("[Clear filters] 주소에도 `event`가 없다", async () => {
  await render(<LogFilters {...props} filter={parseLogFilter({ kind: "publish", event: "evt_closed" })} />);
  const clear = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === m.logs.filters.clear)!;
  await act(async () => clear.click());
  expect(mocks.push).toHaveBeenCalledOnce();
  expect(lastUrl().search).toBe("");
});
