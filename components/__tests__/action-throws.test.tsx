// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **Server Action이 던져도 화면이 제자리로 돌아오고 사유를 말한다** (audit #24). 네 호출부가 `await`를 try 없이 불러,
 * 통신이 끊기면 transition 안의 예외가 error boundary로 올라가 **화면이 통째로 오류 화면**이 됐다 — 입력 중이던 다른
 * 카드까지 함께. 거부(`{ ok: false }`)는 이미 값으로 다뤘으므로 throw만 같은 자리로 접는다.
 */
const mocks = vi.hoisted(() => ({ changeMember: vi.fn(), revokeInvitation: vi.fn(), disconnectGithub: vi.fn(), connectRepository: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation, disconnectGithub: mocks.disconnectGithub }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: mocks.connectRepository }));

import { DisconnectGithubButton } from "@/components/github-account";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { ReconnectButton } from "@/components/reconnect-button";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

const now = new Date("2026-09-17T00:00:00Z");
const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", readable: true, role: "EDITOR", joinedAt: now };
const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", readable: true, role: "OWNER", joinedAt: now };
const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };

const byLabel = (label: string) => {
  const node = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing ${label}`);
  return node;
};
const inDialog = (text: string) => {
  const node = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find(b => b.textContent === text);
  if (!node) throw new Error(`Missing dialog button ${text}`);
  return node;
};
async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }
const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";

beforeEach(() => { vi.clearAllMocks(); });

it("멤버 제거 호출이 던지면 행이 풀리고 확인 불가를 말한다", async () => {
  mocks.changeMember.mockRejectedValue(new Error("offline"));
  await render(<MemberList slug="acme" members={[owner, alice]} role="OWNER" viewerId="u1" now={now} headingId="h" />);
  await click(byLabel("Remove Alice"));
  await click(inDialog("Remove"));
  expect(alert()).toContain(m.members.changeUnconfirmed);
  expect(byLabel("Remove Alice").hasAttribute("disabled")).toBe(false);
});

it("초대 철회 호출이 던지면 행이 풀리고 확인 불가를 말한다", async () => {
  mocks.revokeInvitation.mockRejectedValue(new Error("offline"));
  await render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={now} headingId="h" />);
  await click(byLabel("Revoke invitation for t***@example.com"));
  expect(alert()).toContain(m.members.pending.revokeUnconfirmed);
  expect(byLabel("Revoke invitation for t***@example.com").hasAttribute("disabled")).toBe(false);
});

it("GitHub 연결 해제 호출이 던지면 실패 문구를 세운다", async () => {
  mocks.disconnectGithub.mockRejectedValue(new Error("offline"));
  await render(<DisconnectGithubButton />);
  await click(byLabel(m.settings.account.disconnectLabel));
  await click(inDialog(m.settings.account.disconnect));
  expect(alert()).toContain(m.settings.account.disconnectFailed);
});

it("Reconnect 호출이 던지면 실패 문구를 세운다 — onFailure가 있으면 그쪽으로 보낸다", async () => {
  mocks.connectRepository.mockRejectedValue(new Error("offline"));
  await render(<ReconnectButton slug="acme" label="Reconnect" />);
  await click([...document.querySelectorAll("button")].find(b => b.textContent?.includes("Reconnect"))!);
  expect(alert()).toContain(m.settings.repository.connectFailed);

  const onFailure = vi.fn();
  await render(<ReconnectButton slug="acme" label="Reconnect again" onFailure={onFailure} />);
  await click([...document.querySelectorAll("button")].find(b => b.textContent?.includes("Reconnect again"))!);
  expect(onFailure).toHaveBeenLastCalledWith(m.settings.repository.connectFailed);
});
