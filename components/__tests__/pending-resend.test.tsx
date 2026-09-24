// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PendingInvitations } from "@/components/members/pending-invitations";
import type { PendingInvitation } from "@/lib/auth/query";
import type { Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ resendInvitation: vi.fn(), revokeInvitation: vi.fn(), toast: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ resendInvitation: mocks.resendInvitation, revokeInvitation: mocks.revokeInvitation }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));

/** `invite-modal.test.tsx`와 같은 이유 — jsdom은 disabled가 된 버튼의 포커스를 안 떨어뜨린다. */
function installFocusFixup(): MutationObserver {
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  return observer;
}

/**
 * **Pending의 Resend** (invitation-email T3.2 · 핸드오프 `1l`).
 *
 * - OWNER만. 순서는 역할 칩 → Resend → Revoke. 모달·확인창 없음.
 * - 처리 중엔 **그 행의** Resend·Revoke만 잠긴다.
 * - 성공은 토스트. 실패·제한·미확인은 **카드 머리 아래 카드 안 Alert** — 행이 새 초대로 교체돼도 남는다.
 */
const now = new Date("2026-09-23T12:00:00Z");
const invitation = (over: Partial<PendingInvitation> & { id: string }): PendingInvitation => ({
  emailLabel: `${over.id}***@acme.com`,
  readable: true,
  role: "EDITOR",
  expiresAt: new Date("2026-09-30T00:00:00Z"),
  invitedByName: "Owner",
  ...over,
});
const two = [invitation({ id: "i1", emailLabel: "a***@acme.com" }), invitation({ id: "i2", emailLabel: "b***@acme.com" })];

let rerender: (next: React.ReactNode) => Promise<void>;
let container: HTMLElement;
const view = (invitations: PendingInvitation[], role: Role = "OWNER") => (
  <PendingInvitations slug="acme" invitations={invitations} role={role} now={now} headingId="pending-heading" />
);
const draw = async (invitations: PendingInvitation[] = two, role: Role = "OWNER") => {
  const rendered = await render(view(invitations, role));
  rerender = rendered.rerender;
  container = rendered.container;
};
const rows = () => [...container.querySelectorAll("li")];
const resend = (i: number) => find<HTMLButtonElement>(rows()[i]!, "button[data-resend]");
const revoke = (i: number) => find<HTMLButtonElement>(rows()[i]!, 'button[id^="revoke-"]');
const cardAlert = () => container.querySelector<HTMLElement>("[data-pending-alert]");
const click = async (node: HTMLElement) => { await act(async () => { await userEvent.setup().click(node); }); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

let fixup: MutationObserver | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resendInvitation.mockResolvedValue({ ok: true, label: "a***@acme.com" });
  fixup = installFocusFixup();
});
afterEach(() => { fixup?.disconnect(); fixup = undefined; });

describe("Resend — 누가 보나", () => {
  it("OWNER에게 역할 칩 → Resend → Revoke 순서로 선다", async () => {
    await draw();
    const buttons = [...rows()[0]!.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual([m.members.pending.resend, m.members.pending.revoke]);
    expect(resend(0).getAttribute("aria-label")).toBe(m.members.pending.resendLabel("a***@acme.com"));
    expect(m.members.pending.resendLabel("a***@acme.com")).toBe("Resend invitation to a***@acme.com");
  });

  it("EDITOR에게는 없다", async () => {
    await draw(two, "EDITOR");
    expect(container.querySelector("button[data-resend]")).toBeNull();
  });
});

describe("Resend — 처리 중", () => {
  it("서버에 id만 보낸다", async () => {
    await draw();
    await click(resend(1));
    expect(mocks.resendInvitation).toHaveBeenCalledWith({ slug: "acme", invitationId: "i2" });
  });

  it("그 행의 Resend·Revoke만 잠기고 다른 행은 그대로다", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.resendInvitation.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await draw();
    await click(resend(0));
    expect(resend(0).disabled).toBe(true);
    expect(resend(0).getAttribute("aria-busy")).toBe("true");
    expect(revoke(0).disabled).toBe(true);
    expect(resend(1).disabled).toBe(false);
    expect(revoke(1).disabled).toBe(false);
    await act(async () => { resolve({ ok: true, label: "a***@acme.com" }); });
  });
});

describe("Resend — 두 행을 연달아", () => {
  it("각 행은 자기 응답이 올 때까지 잠긴다 — 먼저 끝난 응답이 다른 행을 풀지 않는다", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    mocks.resendInvitation.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    await draw();
    await click(resend(0));
    await click(resend(1));
    expect(resend(0).disabled).toBe(true);
    expect(resend(1).disabled).toBe(true);
    await act(async () => { resolvers[0]?.({ ok: true, label: "a***@acme.com" }); });
    expect(resend(0).disabled).toBe(false);
    expect(resend(1).disabled).toBe(true);
    expect(revoke(1).disabled).toBe(true);
    await act(async () => { resolvers[1]?.({ ok: true, label: "b***@acme.com" }); });
    expect(resend(1).disabled).toBe(false);
  });
});

describe("Resend — 성공", () => {
  it("토스트는 누른 행의 라벨로 말하고 카드 Alert를 세우지 않는다", async () => {
    await draw();
    await click(resend(0));
    expect(mocks.toast).toHaveBeenCalledWith(m.members.pending.resentToast("a***@acme.com"));
    expect(m.members.pending.resentToast("a***@acme.com")).toBe("Invitation resent to a***@acme.com");
    expect(cardAlert()).toBeNull();
  });

  it("행이 새 초대로 교체되면 포커스가 카드 제목에 닿는다", async () => {
    await draw();
    await click(resend(0));
    await rerender(view([invitation({ id: "i9", emailLabel: "a***@acme.com" }), two[1]!]));
    await settle();
    expect(document.activeElement?.id).toBe("pending-heading");
  });
});

describe("Resend — 실패는 카드 안 Alert 하나", () => {
  it.each([
    [{ ok: false, error: "email-rejected", label: "a***@acme.com", retryAt: "2026-09-23T12:00:30Z" }, () => m.members.pending.resendFailed("a***@acme.com", "2026-09-23 12:01 UTC")],
    [{ ok: false, error: "email-unknown", label: "a***@acme.com", retryAt: "2026-09-23T12:00:30Z" }, () => m.members.pending.resendUnconfirmed("a***@acme.com")],
    [{ ok: false, error: "rate-limited", retryAt: "2026-09-23T12:00:30Z", limit: "address" }, () => m.members.pending.resendLimited("a***@acme.com", "2026-09-23 12:01 UTC")],
    [{ ok: false, error: "rate-limited", retryAt: "2026-09-23T12:00:30Z", limit: "project", used: 20 }, () => m.members.pending.resendProjectLimited("a***@acme.com", 20, "2026-09-23 12:01 UTC")],
    [{ ok: false, error: "email-unavailable" }, () => m.members.pending.resendUnavailable("a***@acme.com")],
    [{ ok: false, error: "not-found" }, () => m.members.pending.gone("a***@acme.com")],
  ])("%j는 대상 라벨을 넣어 카드 머리 아래에 선다", async (result, text) => {
    mocks.resendInvitation.mockResolvedValueOnce(result);
    await draw();
    await click(resend(0));
    const alert = cardAlert();
    expect(alert?.textContent).toContain(text());
    // 행 안이 아니라 카드 안이다 — 목록(ul)보다 앞에 선다.
    expect(alert?.closest("li")).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("행이 교체되거나 목록이 갱신돼도 Alert가 남는다", async () => {
    mocks.resendInvitation.mockResolvedValueOnce({ ok: false, error: "email-unknown", label: "a***@acme.com", retryAt: "2026-09-23T12:00:30Z" });
    await draw();
    await click(resend(0));
    await rerender(view([invitation({ id: "i9", emailLabel: "a***@acme.com" }), two[1]!]));
    expect(cardAlert()?.textContent).toContain(m.members.pending.resendUnconfirmed("a***@acme.com"));
  });

  it("X로 닫히고, 다음 Resend가 시작되면 지워진다", async () => {
    mocks.resendInvitation.mockResolvedValueOnce({ ok: false, error: "not-found" });
    await draw();
    await click(resend(0));
    await click(find<HTMLButtonElement>(cardAlert()!, `button[aria-label="${m.common.dismiss}"]`));
    expect(cardAlert()).toBeNull();

    mocks.resendInvitation.mockResolvedValueOnce({ ok: false, error: "not-found" });
    await click(resend(0));
    expect(cardAlert()).not.toBeNull();
    let resolve: (value: unknown) => void = () => {};
    mocks.resendInvitation.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await click(resend(1));
    expect(cardAlert()).toBeNull();
    await act(async () => { resolve({ ok: true, label: "b***@acme.com" }); });
  });

  it("사전 거부로 행이 남으면 잠금이 풀린 뒤 그 Resend로 포커스가 돌아온다", async () => {
    mocks.resendInvitation.mockResolvedValueOnce({ ok: false, error: "rate-limited", retryAt: "2026-09-23T12:00:30Z", limit: "address" });
    await draw();
    await click(resend(0));
    await settle();
    expect(document.activeElement).toBe(resend(0));
  });

  it("Action 호출 자체가 실패하면 결과 미확인으로 알리고 잠금을 푼다", async () => {
    mocks.resendInvitation.mockRejectedValueOnce(new Error("network"));
    await draw();
    await click(resend(0));
    expect(cardAlert()?.textContent).toContain(m.members.pending.resendUnconfirmed("a***@acme.com"));
    expect(resend(0).disabled).toBe(false);
  });
});
