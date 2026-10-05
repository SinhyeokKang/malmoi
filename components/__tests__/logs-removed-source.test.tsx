// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/** 시안 L1 — 제거된 소스는 Logs 소스 필터에 `{slug} (removed)`로 남고, 고르면 트리거 라벨도 같은 글자다. */
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));

import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { en } from "@/messages/en";

const sources = [{ slug: "web", removed: false }, { slug: "emails", removed: true }];
const props = { slug: "alpha", sources, actors: [], refreshable: true, now: "2026-10-04T23:10:00.000Z" };

it("제거된 소스는 활성 뒤에 (removed) 꼬리를 달고 남는다", async () => {
  await render(<LogFilters {...props} filter={parseLogFilter({})} />);
  const trigger = [...document.querySelectorAll("button")].find(node => node.textContent?.includes(en.logs.filters.anySource))!;
  await act(async () => { await userEvent.setup().click(trigger); });
  const items = [...document.querySelectorAll('[role="menuitemcheckbox"]')].map(node => node.textContent);
  expect(items).toEqual([en.logs.filters.projectWide, "web", `emails ${en.logs.filters.removed}`]);
});

it("제거된 소스를 고르면 트리거 라벨도 (removed)를 든다", async () => {
  await render(<LogFilters {...props} filter={parseLogFilter({ source: "emails" })} />);
  expect(document.body.textContent).toContain(`emails ${en.logs.filters.removed}`);
});
