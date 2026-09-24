// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { find, key, render } from "./helpers/dom";

/**
 * **이벤트 상세의 열림은 주소가 정하고, 닫기는 서버를 기다리지 않는다** (audit-ux #9 · r1). 전엔 `open`이 늘
 * true인 제어형이라 Esc·×를 눌러도 `router.push`의 전체 재조회(Home이면 GitHub probe까지)가 끝날 때까지 떠
 * 있었고, 닫기가 `push`라 뒤로가기를 누르면 상세가 다시 열렸다. r0의 로컬 불리언은 "닫고 곧바로 같은 행을
 * 다시 누르면 영영 닫힘"을 냈다 — 그래서 열림을 `?event=` 하나에서 읽는다.
 */
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
/** Next가 `replaceState`·뒤로가기를 `useSearchParams`에 반영하는 것을 흉내 내는 작은 스토어. */
const url = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let params = new URLSearchParams();
  return {
    get: () => params,
    set: (next: string) => { params = new URLSearchParams(next); listeners.forEach((l) => l()); },
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
  };
});
const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => navigation,
    useSearchParams: () => useSyncExternalStore(url.subscribe, url.get, url.get),
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string; children: ReactNode }) =>
    <a {...props} href={href}>{children}</a>,
  useLinkStatus: () => linkStatus,
}));

import { EventDialog } from "@/components/logs/event-dialog";
import { EventRow } from "@/components/logs/event-row";
import type { EventRow as Row } from "@/lib/events/query";
import { m } from "@/lib/i18n";

let replaceState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  linkStatus.pending = false;
  url.set("");
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation((_data, _unused, next) => {
    act(() => url.set(new URL(String(next), "http://x").search));
  });
});
afterEach(() => replaceState.mockRestore());

/** Radix의 닫힘 포커스 복귀(`onCloseAutoFocus`)는 언마운트 뒤 타이머 한 틱에 돈다. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** 주소가 밖에서 바뀐다 — 행 클릭(push)·뒤로가기·앞으로가기. */
const visit = (search: string) => act(async () => url.set(search));

const CLOSE = "/projects/alpha/logs?kind=sync";
const dialog = (id = "evt_a") => (
  <>
    <div id={`event-${id}`} tabIndex={-1}>row</div>
    <EventDialog closeHref={CLOSE} returnFocusId={`event-${id}`}>
      <h2>detail</h2>
    </EventDialog>
  </>
);
const isOpen = () => document.querySelector('[role="dialog"]') !== null;

it("Esc가 서버를 부르지 않고 닫는다 — 주소는 `replaceState`로 closeHref가 되고 라우터 이동은 0회다", async () => {
  await visit("kind=sync&event=evt_a");
  await render(dialog());
  expect(isOpen()).toBe(true);
  await key(find<HTMLElement>(document, '[role="dialog"]'), "Escape");

  expect(isOpen()).toBe(false);
  expect(replaceState).toHaveBeenCalledTimes(1);
  expect(replaceState.mock.calls[0]?.[2]).toBe(CLOSE);
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.push).not.toHaveBeenCalled();
  await settle();
  // 닫은 포커스는 눌렀던 행으로 돌아간다(트리거가 없는 대화상자다).
  expect(document.activeElement?.id).toBe("event-evt_a");
});

it("×도 같은 길로 닫는다", async () => {
  await visit("event=evt_a");
  await render(dialog());
  const close = find<HTMLButtonElement>(document, `button[aria-label="${m.logs.detail.actions.close}"]`);
  await act(async () => close.click());
  expect(isOpen()).toBe(false);
  expect(replaceState).toHaveBeenCalledTimes(1);
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.push).not.toHaveBeenCalled();
});

it("행이 없으면 화면 제목으로 포커스가 돌아간다", async () => {
  await visit("event=gone");
  await render(<>
    <h1 tabIndex={-1}>Logs</h1>
    <EventDialog closeHref="/logs" returnFocusId="event-gone"><h2>detail</h2></EventDialog>
  </>);
  await key(find<HTMLElement>(document, '[role="dialog"]'), "Escape");
  await settle();
  expect(document.activeElement?.tagName).toBe("H1");
});

it("닫은 직후 같은 행을 다시 누르면 다시 열린다 — 서버가 옛 상세를 그대로 두고 있어도", async () => {
  await visit("event=evt_a");
  const { rerender } = await render(dialog("evt_a"));
  await key(find<HTMLElement>(document, '[role="dialog"]'), "Escape");
  expect(isOpen()).toBe(false);
  // 같은 행 클릭 → 주소가 다시 `?event=evt_a`. 같은 인스턴스·같은 id로 다시 렌더된다.
  await visit("event=evt_a");
  await rerender(dialog("evt_a"));
  expect(isOpen()).toBe(true);
});

it("다른 행을 누르면 그 상세가 서버에서 올 때까지 옛 상세를 열지 않는다", async () => {
  await visit("event=evt_a");
  const { rerender } = await render(dialog("evt_a"));
  await visit("event=evt_b");
  // 서버 응답 전 — 아직 A의 상세가 마운트돼 있지만 주소는 B다.
  expect(isOpen()).toBe(false);
  await rerender(dialog("evt_b"));
  expect(isOpen()).toBe(true);
});

it("뒤로·앞으로 가기로 주소가 바뀌면 열림이 주소를 따른다", async () => {
  await visit("event=evt_a");
  await render(dialog("evt_a"));
  await key(find<HTMLElement>(document, '[role="dialog"]'), "Escape");
  expect(isOpen()).toBe(false);
  await visit("event=evt_a"); // 앞으로가기(또는 캐시된 히스토리 항목)
  expect(isOpen()).toBe(true);
  await visit(""); // 뒤로가기
  expect(isOpen()).toBe(false);
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
