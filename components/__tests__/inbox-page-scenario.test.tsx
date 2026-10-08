// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { MarkAttentionSeenResult, OpenAttentionInboxResult } from "@/app/inbox/actions";
import { MarkSeen } from "@/components/inbox/mark-seen";
import { AttentionInbox } from "@/components/shell/attention-inbox";
import { Sidebar } from "@/components/shell/sidebar";
import { routes } from "@/lib/routes";
import { setUnread } from "@/lib/inbox/unread-store";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * **`/inbox` 방문이 같은 탭의 두 배지를 함께 0으로 만든다** (inbox-page spec 6 · 6a) — 헤더 `AttentionInbox` · 사이드바 `InboxCount` ·
 * 페이지 섬 `MarkSeen`이 각자 단위 테스트를 갖지만, 셋을 잇는 것은 store 하나다. 그 배선을 한 화면에 세워 끝 결과(두 배지)로 단언한다.
 * 레이아웃의 헤더·사이드바는 페이지 이동에 다시 마운트되지 않으므로, 먼저 그려 둔 셸 옆에 페이지 섬이 나중에 선다.
 */
const mocks = vi.hoisted(() => ({ badge: vi.fn(), open: vi.fn(), mark: vi.fn() }));
vi.mock("@/app/inbox/actions", () => ({ loadAttentionBadgeAction: mocks.badge, openAttentionInboxAction: mocks.open, markAttentionSeenAction: mocks.mark }));
vi.mock("next/navigation", () => ({ usePathname: () => "/inbox" }));

const AT = "2026-10-09T12:00:00.000Z";
beforeEach(() => {
  mocks.badge.mockReset().mockResolvedValue({ status: "ok", unread: 12 });
  mocks.open.mockReset();
  mocks.mark.mockReset();
});
afterEach(() => { setUnread(0); });

const headerBadge = () => document.querySelector<HTMLElement>('button[aria-haspopup="menu"] [data-inbox-badge]');
const sidebarBadge = () => document.querySelector<HTMLElement>(`a[href="${routes.inbox()}"] .rounded-full [aria-hidden]`);

async function shell(page: boolean) {
  const node = (withPage: boolean) => <>
    <AttentionInbox />
    <Sidebar memberships={[]} userName="Kim" />
    {withPage && <MarkSeen at={AT} />}
  </>;
  const view = await render(node(false));
  await act(async () => {});
  expect(headerBadge()?.textContent).toBe("9+");
  expect(sidebarBadge()?.textContent).toBe("12");
  if (page) {
    await view.rerender(node(true));
    await act(async () => {});
  }
}

it("페이지가 읽음을 기록하면 헤더·사이드바 배지가 이동 없이 함께 사라지고, 헤더 이름도 0을 말한다", async () => {
  mocks.mark.mockResolvedValue({ status: "ok", marked: true } satisfies MarkAttentionSeenResult);
  await shell(true);
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith(AT);
  expect(headerBadge()).toBeNull();
  expect(sidebarBadge()).toBeNull();
  expect(document.querySelector('button[aria-haspopup="menu"]')?.getAttribute("aria-label")).toBe(en.inbox.label);
  // 배지 수를 위한 조회는 헤더의 한 번뿐이다 — 사이드바가 따로 묻지 않는다.
  expect(mocks.badge).toHaveBeenCalledTimes(1);
  expect(mocks.open).not.toHaveBeenCalled();
});

it.each([
  ["marked: false", { status: "ok", marked: false }],
  ["failed", { status: "failed" }],
] as const)("기록이 %s면 두 배지가 그대로다 — 서버 워터마크가 안 움직였다", async (_label, result) => {
  mocks.mark.mockResolvedValue(result);
  await shell(true);
  expect(headerBadge()?.textContent).toBe("9+");
  expect(sidebarBadge()?.textContent).toBe("12");
});

/** review-c 🟡3 — 드롭다운 경로도 같은 store를 지난다. 열고 marked 응답 뒤 닫으면 사이드바 배지가 헤더와 함께 사라진다. */
it("헤더 메뉴를 열어 읽음이 기록되면 닫는 순간 헤더·사이드바 배지가 함께 사라진다", async () => {
  const response: OpenAttentionInboxResult = { status: "ok", plan: { groups: [], unread: 0 }, loadedAt: new Date(AT), marked: true };
  mocks.open.mockResolvedValue(response);
  await shell(false);
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  await act(async () => { await userEvent.setup().click(trigger); });
  expect(mocks.open).toHaveBeenCalledTimes(1);
  // 열린 동안은 둘 다 그대로다 — 트리거가 열린 메뉴 밑에서 줄지 않는다(시안 D1).
  expect(headerBadge()?.textContent).toBe("9+");
  expect(sidebarBadge()?.textContent).toBe("12");
  await act(async () => { await userEvent.setup().keyboard("{Escape}"); });
  expect(headerBadge()).toBeNull();
  expect(sidebarBadge()).toBeNull();
  expect(mocks.badge).toHaveBeenCalledTimes(1);
});
