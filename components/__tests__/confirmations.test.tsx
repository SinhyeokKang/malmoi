// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InviteModal } from "@/components/members/invite-modal";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

import { find, input, render } from "./helpers/dom";

/**
 * **되돌릴 수 없는 행동 셋에 확인을 받는다** (audit #19 · #20) + **오류 코드 원문을 문장에 끼우지 않는다** (#21 · #22).
 *
 * ⚠️ "호출되지 않는다"만 단언하지 않는다 — 같은 픽스처에서 확인을 누르면 **호출된다**를 짝으로 둔다
 * (POSTMORTEM 2026-09-14: 0을 단언하는 검증은 허용 경로의 N > 0과 짝이다).
 */
const mocks = vi.hoisted(() => ({
  changeMember: vi.fn(), revokeInvitation: vi.fn(), resendInvitation: vi.fn(), createInvitations: vi.fn(), rotatePushToken: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => mocks);
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));

beforeEach(() => { vi.clearAllMocks(); });

const now = new Date("2026-09-17T00:00:00Z");
const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", readable: true, role: "OWNER", joinedAt: now };
const second: MemberView = { userId: "u3", name: "Second", emailLabel: "s***@example.com", readable: true, role: "OWNER", joinedAt: now };
const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", readable: true, role: "EDITOR", joinedAt: now };
const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };

const user = () => userEvent.setup();
async function click(node: Element) { await act(async () => { await user().click(node); }); }
const byLabel = (label: string) => find<HTMLElement>(document.body, `[aria-label="${label}"]`);
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
const inDialog = (text: string) => {
  const node = [...(dialog()?.querySelectorAll<HTMLElement>("button") ?? [])].find((b) => b.textContent?.trim() === text);
  if (!node) throw new Error(`Missing dialog button ${text}`);
  return node;
};
const alertText = () => [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent).join(" ");

async function pickRole(userId: string, label: string) {
  await click(find(document.body, `#role-${userId}`));
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.trim() === label);
  if (!option) throw new Error(`Missing option ${label}`);
  await click(option);
}

describe("#20 역할 변경은 확인을 받는다", () => {
  const draw = (viewerId = "u1", members = [owner, alice]) =>
    render(<MemberList slug="acme" members={members} role="OWNER" viewerId={viewerId} now={now} headingId="h" />);

  it("고르기만 하면 쓰지 않고, 확인하면 그 역할로 쓴다", async () => {
    mocks.changeMember.mockResolvedValue({ ok: true });
    await draw();
    await pickRole("u2", m.projects.role.OWNER);
    expect(mocks.changeMember).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(m.members.confirmRole("Alice", m.projects.role.OWNER));
    await click(inDialog(m.members.confirmRoleAction));
    expect(mocks.changeMember).toHaveBeenCalledWith({ slug: "acme", targetUserId: "u2", nextRole: "OWNER" });
  });

  it("취소하면 쓰지 않는다", async () => {
    await draw();
    await pickRole("u2", m.projects.role.OWNER);
    await click(inDialog(m.members.cancel));
    expect(mocks.changeMember).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("자기 강등은 잃는 것을 말한다 — 남의 변경에는 그 문장이 없다", async () => {
    await draw("u1", [owner, second, alice]);
    await pickRole("u1", m.projects.role.EDITOR);
    expect(dialog()?.textContent).toContain(m.members.confirmSelfDemote);
    await click(inDialog(m.members.cancel));
    await pickRole("u3", m.projects.role.EDITOR);
    expect(dialog()?.textContent).not.toContain(m.members.confirmSelfDemote);
  });

  it("모르는 거부 코드를 문장에 끼우지 않는다 (#21)", async () => {
    mocks.changeMember.mockResolvedValue({ ok: false, error: "invalid input" });
    await draw();
    await pickRole("u2", m.projects.role.OWNER);
    await click(inDialog(m.members.confirmRoleAction));
    expect(alertText()).not.toContain("invalid input");
    expect(alertText()).toContain(m.members.changeFailed);
  });
});

describe("#20 초대 철회는 확인을 받는다", () => {
  const draw = () => render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={now} headingId="h" />);

  it("누르기만 하면 쓰지 않고, 확인하면 쓴다", async () => {
    mocks.revokeInvitation.mockResolvedValue({ ok: true });
    await draw();
    await click(byLabel(m.members.pending.revokeLabel("t***@example.com")));
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(m.members.pending.confirmRevoke("t***@example.com"));
    await click(inDialog(m.members.pending.confirmRevokeAction));
    expect(mocks.revokeInvitation).toHaveBeenCalledWith({ slug: "acme", invitationId: "i1" });
  });

  it("이미 없는 초대는 OWNER에게 초대 링크를 확인하라고 하지 않는다 (#22)", async () => {
    mocks.revokeInvitation.mockResolvedValue({ ok: false, error: "not-found" });
    await draw();
    await click(byLabel(m.members.pending.revokeLabel("t***@example.com")));
    await click(inDialog(m.members.pending.confirmRevokeAction));
    expect(alertText()).not.toContain("invite link");
    expect(alertText()).toContain(m.members.pending.revokeGone("t***@example.com"));
  });

  it("모르는 거부 코드를 문장에 끼우지 않는다 (#21)", async () => {
    mocks.revokeInvitation.mockResolvedValue({ ok: false, error: "weird-code" });
    await draw();
    await click(byLabel(m.members.pending.revokeLabel("t***@example.com")));
    await click(inDialog(m.members.pending.confirmRevokeAction));
    expect(alertText()).not.toContain("weird-code");
    expect(alertText()).toContain(m.members.pending.revokeFailed);
  });

  it("재발송의 모르는 거부 코드도 끼우지 않는다 (#21)", async () => {
    mocks.resendInvitation.mockResolvedValue({ ok: false, error: "weird-code" });
    await draw();
    await click(byLabel(m.members.pending.resendLabel("t***@example.com")));
    expect(document.body.textContent).not.toContain("weird-code");
    expect(document.body.textContent).toContain(m.members.pending.resendError("t***@example.com"));
  });
});

describe("#21 초대 폼의 모르는 거부", () => {
  it("코드 원문 대신 새로고침을 권한다", async () => {
    mocks.createInvitations.mockResolvedValue({ ok: false, error: "weird-code" });
    const ref = { current: null } as { current: HTMLElement | null };
    await render(<InviteModal slug="acme" open onClose={() => {}} seats={{ n: 1, limit: 10 }} returnFocusRef={ref} />);
    await input(find<HTMLInputElement>(document.body, 'input[inputmode="email"]'), "a@example.com");
    await click(find(document.body, 'button[type="submit"]'));
    expect(document.body.textContent).not.toContain("weird-code");
    expect(document.body.textContent).toContain(m.members.invite.failed);
  });
});

describe("#19 push 토큰 회전은 확인을 받는다", () => {
  it("누르기만 하면 회전하지 않고, 확인하면 회전한다", async () => {
    mocks.rotatePushToken.mockResolvedValue({ ok: true, pushToken: "tok_new" });
    await render(<PushTokenPanel slug="acme" />);
    const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(m.settings.token.rotate));
    if (!trigger) throw new Error("Missing rotate");
    await click(trigger);
    expect(mocks.rotatePushToken).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(m.settings.token.confirmTitle);
    await click(inDialog(m.settings.token.confirmAction));
    expect(mocks.rotatePushToken).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("tok_new");
    // 방금 받은 토큰도 다시 누르면 확인부터 — 재클릭 한 번으로 죽지 않는다.
    await click(trigger);
    expect(mocks.rotatePushToken).toHaveBeenCalledTimes(1);
    expect(dialog()?.textContent).toContain(m.settings.token.confirmTitle);
  });

  it("장애 거부는 '입력이 남아 있다'를 말하지 않는다 — 이 화면엔 입력이 없다 (#22)", async () => {
    mocks.rotatePushToken.mockResolvedValue({ ok: false, error: "unavailable" });
    await render(<PushTokenPanel slug="acme" />);
    const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(m.settings.token.rotate));
    if (!trigger) throw new Error("Missing rotate");
    await click(trigger);
    await click(inDialog(m.settings.token.confirmAction));
    expect(document.body.textContent).not.toMatch(/text is kept/i);
    expect(document.body.textContent).toContain(m.errors.access.unavailable);
  });
});
