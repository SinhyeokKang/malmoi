// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { find, key, render } from "./helpers/dom";

/**
 * **이벤트 상세의 닫기는 서버를 기다리지 않는다** (audit-ux #9). 전엔 `open`이 늘 true인 제어형이라
 * Esc·×를 눌러도 `router.push`의 전체 재조회(Home이면 GitHub probe까지)가 끝날 때까지 떠 있었고,
 * 닫기가 `push`라 뒤로가기를 누르면 상세가 다시 열렸다.
 */
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string; children: ReactNode }) =>
    <a {...props} href={href}>{children}</a>,
  useLinkStatus: () => linkStatus,
}));

import { EventDialog } from "@/components/logs/event-dialog";
import { EventRow } from "@/components/logs/event-row";
import type { EventRow as Row } from "@/lib/events/query";
import { m } from "@/lib/i18n";

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  linkStatus.pending = false;
});

/** Radix의 닫힘 포커스 복귀(`onCloseAutoFocus`)는 언마운트 뒤 타이머 한 틱에 돈다. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const dialog = (id = "evt_a") => (
  <>
    <div id={`event-${id}`} tabIndex={-1}>row</div>
    <EventDialog closeHref="/projects/alpha/logs?kind=sync" returnFocusId={`event-${id}`}>
      <h2>detail</h2>
    </EventDialog>
  </>
);

it("Esc가 URL을 기다리지 않고 먼저 닫고, URL은 `replace`로 뒤따른다 — 뒤로가기가 상세를 되살리지 않는다", async () => {
  // replace가 끝나지 않는 느린 서버를 흉내 낸다 — 라우터는 아무것도 커밋하지 않는다.
  navigation.replace.mockImplementation(() => {});
  await render(dialog());
  const content = find<HTMLElement>(document, '[role="dialog"]');
  await key(content, "Escape");

  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/projects/alpha/logs?kind=sync", { scroll: false });
  expect(navigation.push).not.toHaveBeenCalled();
  await settle();
  // 닫은 포커스는 눌렀던 행으로 돌아간다(트리거가 없는 대화상자다).
  expect(document.activeElement?.id).toBe("event-evt_a");
});

it("×도 같은 길로 닫는다", async () => {
  await render(dialog());
  const close = find<HTMLButtonElement>(document, `button[aria-label="${m.logs.detail.actions.close}"]`);
  await act(async () => close.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(navigation.push).not.toHaveBeenCalled();
});

it("행이 없으면 화면 제목으로 포커스가 돌아간다", async () => {
  await render(<>
    <h1 tabIndex={-1}>Logs</h1>
    <EventDialog closeHref="/logs" returnFocusId="event-gone"><h2>detail</h2></EventDialog>
  </>);
  await key(find<HTMLElement>(document, '[role="dialog"]'), "Escape");
  await settle();
  expect(document.activeElement?.tagName).toBe("H1");
});

it("다른 이벤트가 열리면 닫았던 상태를 물려받지 않는다", async () => {
  const { rerender } = await render(dialog("evt_a"));
  await key(find<HTMLElement>(document, '[role="dialog"]'), "Escape");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  // 서버가 아직 옛 상세를 그리는 사이에 다른 행을 눌렀다 — 같은 인스턴스가 새 대상으로 다시 렌더된다.
  await rerender(dialog("evt_b"));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});

const row: Row = {
  id: "e1",
  ref: "evt_a",
  kind: "SETTINGS",
  subtype: null,
  result: null,
  occurredAt: new Date("2026-09-20T09:42:00Z"),
  actor: { kind: "USER", name: "Ada", emailLabel: null, removed: false },
  payload: null,
  run: null,
} as unknown as Row;

it("행을 누르면 상세가 뜨기 전까지 행의 chevron이 스피너로 바뀐다 — 폭은 그대로다", async () => {
  const now = new Date("2026-09-21T00:00:00Z");
  const idle = await render(<EventRow row={row} href="/logs?event=evt_a" now={now} archived={false} />);
  expect(idle.container.querySelector(".lucide-chevron-right")).not.toBeNull();
  expect(idle.container.querySelector(".animate-spin")).toBeNull();

  linkStatus.pending = true;
  const busy = await render(<EventRow row={row} href="/logs?event=evt_a" now={now} archived={false} />);
  expect(busy.container.querySelector(".lucide-chevron-right")).toBeNull();
  const spinner = find<SVGElement>(busy.container, ".animate-spin");
  // 교체한 아이콘이 같은 16 정방이어야 행이 안 흔들린다 (DESIGN §6 `Button loading`).
  expect(spinner.getAttribute("class")).toContain("size-4");
});
