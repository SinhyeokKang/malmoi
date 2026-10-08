// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { setUnread } from "@/lib/inbox/unread-store";

import { render } from "./helpers/dom";

/**
 * **Sign out에도 진행 표시가 있다** (audit #25). `/account`의 것은 `useFormStatus`로 스피너·disabled를 드는데 셸의
 * 자리(2026-09-27부터 헤더 사용자 메뉴 하나 — 사이드바 하단의 것은 지웠다)는 없어서, 느린 응답 동안 누른 것이 먹혔는지 모르고 다시 누르게 됐다.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));

import { Sidebar } from "@/components/shell/sidebar";
import { UserMenu } from "@/components/shell/user-menu";
import { en } from "@/messages/en";
import { routes } from "@/lib/routes";

/**
 * ⚠️ **끝에서 푼다** (POSTMORTEM 2026-09-18) — 영원히 안 끝나는 form action은 React의 전역 async action 스코프를 붙잡아
 * 뒤 테스트의 transition까지 pending으로 둔다.
 */
function held() {
  let settle: () => void = () => {};
  const promise = new Promise<void>(resolve => { settle = resolve; });
  return { run: vi.fn(() => promise), settle: () => act(async () => settle()) };
}
const signOutItem = () => {
  const node = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(b => b.textContent?.trim() === en.common.nav.signOut);
  if (!node) throw new Error("no sign out");
  return node;
};

/**
 * ⚠️ **사이드바에는 Sign out이 없다** (2026-09-27 사용자) — 로그아웃은 사용자 메뉴 하나에만 있다. 하단은 Changelog · Docs 둘이다.
 */
it("사이드바 하단에 Sign out이 없고 Changelog · Docs 순이다 — 둘 다 같은 탭", async () => {
  const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
  expect(container.querySelector("form")).toBeNull();
  expect([...container.querySelectorAll("button")].some(b => b.textContent?.trim() === en.common.nav.signOut)).toBe(false);
  const footer = [...container.querySelectorAll<HTMLAnchorElement>('[data-sidebar-zone="footer"] a')];
  expect(footer.map(a => [a.textContent?.trim(), a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")])).toEqual([
    [en.changelog.title, routes.changelog(), null, null],
    [en.publicDocs.docs.title, routes.docs(), null, null],
  ]);
});

it("사용자 메뉴 Sign out은 제출 중에도 메뉴가 열린 채 disabled + 스피너다", async () => {
  const { run: signOut, settle } = held();
  const user = userEvent.setup();
  // 멤버십을 넘겨 지연 조회(실제 Server Action)에 닿지 않게 한다 — 이 파일은 Sign out만 본다(지연 경로는 user-menu.test.tsx).
  await render(<UserMenu name="Kim" email="k***@acme.com" image={null} signOut={signOut} memberships={[]} />);
  await act(async () => user.click(document.querySelector<HTMLButtonElement>(`button[aria-label="${en.common.nav.userMenu}"]`)!));
  await act(async () => user.click(signOutItem()));
  expect(signOut).toHaveBeenCalledOnce();
  // 메뉴가 열린 채다 — 닫히면 진행 표시를 세울 자리가 사라진다.
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(signOutItem().getAttribute("aria-disabled")).toBe("true");
  expect(signOutItem().getAttribute("aria-busy")).toBe("true");
  expect(signOutItem().querySelector(".animate-spin")).not.toBeNull();
  await settle();
});

// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2) — 헤더·사이드바를 그리는 파일은 매번 되돌린다.
afterEach(() => { setUnread(0); });
