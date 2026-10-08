// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { MarkAttentionSeenResult } from "@/app/inbox/actions";
import { MarkSeen } from "@/components/inbox/mark-seen";
import { onSeen, setUnread } from "@/lib/inbox/unread-store";

import { render } from "./helpers/dom";

/**
 * `/inbox` 페이지의 읽음 기록 섬 (inbox-page D1). 마운트 뒤 Action을 한 번 부르고, 서버 워터마크가 실제로 움직였을 때만(`marked: true`)
 * 탭 안 헤더·사이드바에 읽음 신호를 보낸다. 실패·`marked: false`면 배지가 그대로다(서버가 안 움직였다).
 */
const mocks = vi.hoisted(() => ({ mark: vi.fn() }));
vi.mock("@/app/inbox/actions", () => ({ markAttentionSeenAction: mocks.mark }));

const AT = "2026-10-09T12:00:00.000Z";
const seen = vi.fn();
let stop: () => void;
beforeEach(() => {
  mocks.mark.mockReset().mockResolvedValue({ status: "ok", marked: true } satisfies MarkAttentionSeenResult);
  seen.mockClear();
  stop = onSeen(seen);
});
afterEach(() => { stop(); setUnread(0); });

it("마운트 뒤 조회 전 시각 문자열로 한 번 부르고, marked면 읽음 신호를 한 번 보낸다", async () => {
  await render(<MarkSeen at={AT} />);
  await act(async () => {});
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith(AT);
  expect(seen).toHaveBeenCalledOnce();
});

it.each([
  ["marked: false", { status: "ok", marked: false }],
  ["failed", { status: "failed" }],
  ["invalid", { status: "invalid" }],
] as const)("%s면 신호를 보내지 않는다 — 배지가 남는다", async (_label, result) => {
  mocks.mark.mockResolvedValue(result);
  await render(<MarkSeen at={AT} />);
  await act(async () => {});
  expect(mocks.mark).toHaveBeenCalledOnce();
  expect(seen).not.toHaveBeenCalled();
});

it("Action이 거부되면 신호도 처리되지 않은 오류도 없다", async () => {
  mocks.mark.mockRejectedValue(new Error("network"));
  await render(<MarkSeen at={AT} />);
  await act(async () => {});
  expect(seen).not.toHaveBeenCalled();
});

it("같은 시각으로 다시 그려도 Action은 한 번이다", async () => {
  const view = await render(<MarkSeen at={AT} />);
  await view.rerender(<MarkSeen at={AT} />);
  await view.rerender(<MarkSeen at={AT} />);
  await act(async () => {});
  expect(mocks.mark).toHaveBeenCalledOnce();
});

it("화면에 아무것도 그리지 않는다", async () => {
  const { container } = await render(<MarkSeen at={AT} />);
  expect(container.innerHTML).toBe("");
});

it("StrictMode의 이중 effect에서도 같은 시각만 보내고 신호 수는 성공한 기록 수와 같다", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<StrictMode><MarkSeen at={AT} /></StrictMode>));
  await act(async () => {});
  expect(mocks.mark.mock.calls.length).toBeGreaterThanOrEqual(1);
  for (const call of mocks.mark.mock.calls) expect(call).toEqual([AT]);
  expect(seen).toHaveBeenCalledTimes(mocks.mark.mock.calls.length);
  await act(async () => root.unmount());
  container.remove();
});
