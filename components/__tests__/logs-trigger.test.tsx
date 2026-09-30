// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * nightly-sync F1 — Logs가 실행 주체를 `Nightly`·`CI`·사람 이름으로 가른다. 전엔 AUTOMATION IMPORT가 전부 `CI`였고
 * 행위자 메뉴의 `automation` 한 항목이 `Nightly`로 적힌 채 CI까지 걸렀다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

import { EventDetail } from "@/components/logs/event-detail";
import { EventRow } from "@/components/logs/event-row";
import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import type { EventRow as Row } from "@/lib/events/query";
import { m } from "@/lib/i18n";

beforeEach(() => { mocks.push.mockReset(); });

const now = new Date("2026-09-20T12:00:00Z");
const importPayload = { kind: "IMPORT" as const, source: "nightly" as const, surfaceSlugs: ["web"], keys: null, pendingEdits: null,
  surfaces: [], errorCode: null, refusal: null, deferReason: null, changedValues: null };
const row = (over: Partial<Row> = {}): Row => ({
  id: "e1", ref: "evt_test", kind: "IMPORT", subtype: "nightly.skip", occurredAt: now, finishedAt: now, result: "upToDate",
  actor: { kind: "AUTOMATION", removed: false, name: null, emailLabel: null },
  surfaceIds: ["s1"], surfaceScope: "sources", run: null, payload: importPayload, ...over,
});
const human = { kind: "USER" as const, removed: false, name: null, emailLabel: "ki***@acme.dev" };

const detail = (value: Row) => render(
  <Dialog.Root open><Dialog.Content aria-describedby={undefined}>
    <EventDetail row={value} slug="alpha" now={now} archived={false} canOpenSettings={false} repoUrl={null} />
  </Dialog.Content></Dialog.Root>,
);
const field = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("tr")].find((tr) => tr.querySelector("th")?.textContent === label)?.querySelector("td")?.textContent;
const actorText = (container: HTMLElement) => container.querySelector(".font-medium")?.textContent;

describe("행위자 — 야간·CI·사람", () => {
  it.each([
    ["야간 스킵", row(), m.logs.trigger.cron],
    ["야간 적재", row({ subtype: "import.nightly", result: "imported" }), m.logs.trigger.cron],
    ["CI 적재", row({ subtype: "import.ci", result: "imported", payload: { ...importPayload, source: "ci" } }), m.logs.trigger.ci],
    ["야간 Publish", row({ kind: "PUBLISH", subtype: "publish.run", result: "sent", payload: { kind: "PUBLISH", surfaceSlugs: [], refusal: null },
      run: { changed: 1, warnings: 0, withheld: 0, prUrl: null, errorCode: null } }), m.logs.trigger.cron],
  ])("%s 행의 행위자와 상세 Trigger가 같은 낱말이다", async (_, value, word) => {
    const { container } = await render(<EventRow row={value} href="/logs" now={now} archived={false} />);
    expect(actorText(container)).toBe(word);
    const opened = await detail(value);
    expect(field(opened.container, m.logs.detail.labels.trigger)).toBe(word);
  });

  it("사람 행은 마스킹된 이름 그대로다", async () => {
    const value = row({ subtype: "import.run", result: "imported", actor: human, payload: { ...importPayload, source: "manual" } });
    const { container } = await render(<EventRow row={value} href="/logs" now={now} archived={false} />);
    expect(actorText(container)).toBe("ki***@acme.dev");
    expect(field((await detail(value)).container, m.logs.detail.labels.trigger)).toBe("ki***@acme.dev");
  });
});

describe("보류 사유와 바뀐 값 수", () => {
  it("open-pr 보류 행과 상세가 '0 unsent edits'를 내지 않는다", async () => {
    const value = row({ subtype: "import.ci", result: "deferred", payload: { ...importPayload, source: "ci", deferReason: "open-pr", pendingEdits: 0 } });
    const { container } = await render(<EventRow row={value} href="/logs" now={now} archived={false} />);
    expect(container.textContent).not.toContain("0 unsent edits");
    expect(container.textContent).toContain(m.logs.deferReasons["open-pr"]);
    const opened = await detail(value);
    expect(opened.container.textContent).not.toContain("0 unsent edits");
    expect(opened.container.textContent).toContain(m.logs.deferReasons["open-pr"]);
  });

  it("changedValues가 있으면 'N values changed', 없으면 —", async () => {
    const withValues = row({ subtype: "import.nightly", result: "imported", payload: { ...importPayload, changedValues: 3 } });
    expect(field((await detail(withValues)).container, m.logs.detail.labels.values)).toBe(m.logs.meta.values(3));
    const without = row({ subtype: "import.nightly", result: "imported" });
    expect(field((await detail(without)).container, m.logs.detail.labels.values)).toBe(m.logs.none);
  });

  it("실패 실행은 값이 실려 있어도 0이 아니라 —다", async () => {
    const failed = row({ subtype: "import.nightly", result: "failed", payload: { ...importPayload, changedValues: 0 } });
    expect(field((await detail(failed)).container, m.logs.detail.labels.values)).toBe(m.logs.none);
  });
});

describe("행위자 메뉴 — CI · Nightly", () => {
  const props = { slug: "alpha", sources: [], actors: [], refreshable: true };
  const trigger = () => {
    const node = document.querySelector<HTMLButtonElement>('button[aria-label^="Actor:"]');
    if (!node) throw new Error("no actor trigger");
    return node;
  };
  const items = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')];

  it.each([["ci", m.logs.trigger.ci], ["nightly", m.logs.trigger.cron]] as const)("%s 항목을 고르면 URL ?actor=로 가고, 그 URL이 칩 라벨로 돌아온다", async (value, label) => {
    const user = userEvent.setup();
    const { rerender } = await render(<LogFilters {...props} filter={parseLogFilter({})} />);
    trigger().focus();
    await act(async () => user.keyboard("{Enter}"));
    const item = items().find((node) => node.textContent === label);
    expect(item).toBeDefined();
    await act(async () => user.click(item!));
    const url = new URL(String(mocks.push.mock.calls.at(-1)?.[0]), "http://x");
    expect(url.searchParams.get("actor")).toBe(value);
    await rerender(<LogFilters {...props} filter={parseLogFilter(Object.fromEntries(url.searchParams))} />);
    expect(trigger().getAttribute("aria-label")).toBe(`${m.logs.filters.axis.actor}: ${label}`);
  });

  it("메뉴에 옛 automation 항목이 없고 CI·Nightly 둘이 선다", async () => {
    const user = userEvent.setup();
    await render(<LogFilters {...props} filter={parseLogFilter({})} />);
    trigger().focus();
    await act(async () => user.keyboard("{Enter}"));
    const labels = items().map((node) => node.textContent);
    expect(labels).toContain(m.logs.trigger.ci);
    expect(labels).toContain(m.logs.trigger.cron);
    expect(labels.filter((label) => label === m.logs.trigger.cron)).toHaveLength(1);
  });

  it.each([["ci", m.logs.trigger.ci], ["nightly", m.logs.trigger.cron], ["automation", m.logs.filters.automation]] as const)(
    "?actor=%s의 칩이 Unreadable이 아니다", async (value, label) => {
      await render(<LogFilters {...props} filter={parseLogFilter({ actor: value })} />);
      expect(trigger().getAttribute("aria-label")).toBe(`${m.logs.filters.axis.actor}: ${label}`);
    });
});
