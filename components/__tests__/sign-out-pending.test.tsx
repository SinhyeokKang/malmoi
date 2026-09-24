// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **Sign out에도 진행 표시가 있다** (audit #25). `/account`의 것은 `useFormStatus`로 스피너·disabled를 드는데 셸의 두
 * 자리(사이드바 하단 · 헤더 사용자 메뉴)는 없어서, 느린 응답 동안 누른 것이 먹혔는지 모르고 다시 누르게 됐다.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));

import { Sidebar } from "@/components/shell/sidebar";
import { UserMenu } from "@/components/shell/user-menu";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **끝에서 푼다** (POSTMORTEM 2026-09-18) — 영원히 안 끝나는 form action은 React의 전역 async action 스코프를 붙잡아
 * 뒤 테스트의 transition까지 pending으로 둔다.
 */
function held() {
  let settle: () => void = () => {};
  const promise = new Promise<void>(resolve => { settle = resolve; });
  return { run: vi.fn(() => promise), settle: () => act(async () => settle()) };
}
const signOutButton = () => {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === m.common.nav.signOut);
  if (!node) throw new Error("no sign out");
  return node;
};

it("사이드바 Sign out은 제출 중 disabled + 스피너다", async () => {
  const { run: signOut, settle } = held();
  await render(<Sidebar memberships={[]} userName="Kim" userImage={null} signOut={signOut} />);
  await act(async () => userEvent.setup().click(signOutButton()));
  expect(signOut).toHaveBeenCalledOnce();
  expect(signOutButton().disabled).toBe(true);
  expect(signOutButton().querySelector(".animate-spin")).not.toBeNull();
  await settle();
});

it("사용자 메뉴 Sign out은 제출 중에도 메뉴가 열린 채 disabled + 스피너다", async () => {
  const { run: signOut, settle } = held();
  const user = userEvent.setup();
  await render(<UserMenu name="Kim" email="k***@acme.com" image={null} signOut={signOut} />);
  await act(async () => user.click(document.querySelector<HTMLButtonElement>(`button[aria-label="${m.common.nav.userMenu}"]`)!));
  await act(async () => user.click(signOutButton()));
  expect(signOut).toHaveBeenCalledOnce();
  expect(signOutButton().disabled).toBe(true);
  expect(signOutButton().querySelector(".animate-spin")).not.toBeNull();
  await settle();
});
