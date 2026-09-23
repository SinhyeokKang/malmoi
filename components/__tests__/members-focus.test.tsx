// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";

import { render } from "./helpers/dom";

/**
 * **행을 지운 뒤 포커스가 `body`로 빠지지 않고, 결과가 한 번 읽힌다** (malmoi#51).
 *
 * ⚠️ 포커스를 쥔 행 자체가 사라지는 동작이라 브라우저가 `body`로 떨어뜨린다. 착지점은 **그 표의 제목**
 * 이다 — 이웃 행은 마지막 행을 지우면 없고, 제목은 표가 빈 상태로 접혀도 남는다. 제목은 서버 페이지가
 * 그리므로 컴포넌트는 `headingId`로 받는다.
 *
 * ⚠️ **live 영역은 결과 전부터 DOM에 있어야 한다** — 텍스트와 함께 새로 붙는 `role="status"`는 스크린
 * 리더가 놓친다. 그리고 **빈 상태로 접혀도 같은 노드가 남아야 한다**(마지막 초대를 지운 경우).
 */
const mocks = vi.hoisted(() => ({ changeMember: vi.fn(), revokeInvitation: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ changeMember: mocks.changeMember, revokeInvitation: mocks.revokeInvitation }));

const now = new Date("2026-09-17T00:00:00Z");
const alice: MemberView = { userId: "u2", name: "Alice", emailLabel: "a***@example.com", readable: true, role: "EDITOR", joinedAt: now };
const owner: MemberView = { userId: "u1", name: "Owner", emailLabel: "o***@example.com", readable: true, role: "OWNER", joinedAt: now };
const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "Owner" };

const status = () => document.querySelector('[role="status"]');
const byLabel = (label: string) => {
  const node = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing ${label}`);
  return node;
};
async function click(node: HTMLElement) { await act(async () => { await userEvent.setup().click(node); }); }
/** 철회는 확인을 한 번 받는다 (audit #20) — 확정 버튼은 트리거와 이름이 다르다. */
async function confirmRevoke() {
  const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find((b) => b.textContent === "Revoke invitation");
  if (!confirm) throw new Error("Missing confirm");
  await click(confirm);
}
/** 응답을 손으로 푼다 — 즉시 풀리면 `disabled`가 켜졌다 꺼지는 사이에 아래 fixup이 돌 틈이 없다. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve: async (value: T) => { await act(async () => { resolve(value); }); } };
}

/**
 * ⚠️ **jsdom에는 HTML의 focus fixup 규칙이 없다** — 포커스된 버튼이 `disabled`가 되면 브라우저는
 * `activeElement`를 `body`로 돌리지만 jsdom은 그대로 둔다. 그래서 Revoke(그때는 Dialog 없이 누른 버튼
 * 자체가 `loading`이 되는 갈래)의 #53이 jsdom에서 green이었다. 그 규칙만 흉내 낸다.
 */
let fixup: MutationObserver | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    // jsdom의 `blur()`는 포커스 가능한 요소에서만 돈다 — 속성을 잠깐 걷어야 풀린다.
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => { fixup?.disconnect(); });

describe("Members — Remove", () => {
  /**
   * ⚠️ **제목을 여기서 그리지 않는다** (2026-09-19). 전에는 이 래퍼가 `<h1 id tabIndex={-1}>`을 **자기가**
   * 그려서, 컴포넌트가 착지점을 실제로 렌더하지 않아도 green이었다 — 그 구멍을 `members-screen.test.ts`의
   * 소스 대조가 메우고 있었다. 이제 카드가 제목을 들므로 **이 렌더가 그 짝을 직접 잰다.**
   */
  function Screen({ members }: { members: MemberView[] }) {
    return <MemberList slug="acme" members={members} role="OWNER" viewerId="u1" now={now} headingId="members-heading" />;
  }

  it("확인 후 성공하면 제목으로 포커스가 가고 결과가 대상 이름과 함께 읽힌다", async () => {
    mocks.changeMember.mockResolvedValue({ ok: true });
    const view = await render(<Screen members={[owner, alice]} />);
    expect(status()?.textContent).toBe("");

    await click(byLabel("Remove Alice"));
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find((b) => b.textContent === "Remove");
    if (!confirm) throw new Error("Missing confirm");
    await click(confirm);
    // 서버 revalidate가 행을 걷어낸 상태를 재현한다.
    await view.rerender(<Screen members={[owner]} />);

    expect(mocks.changeMember).toHaveBeenCalledWith({ slug: "acme", targetUserId: "u2", nextRole: null });
    expect(document.activeElement?.id).toBe("members-heading");
    expect(status()?.textContent).toContain("Alice");
  });

  /**
   * ⚠️ **거부되면 포커스가 그 행의 Remove로 돌아온다** (malmoi#53). Dialog가 닫히며 트리거로 포커스를
   * 돌려주는데 그 순간 트리거는 `loading` → `disabled`라 받지 못하고 `body`로 빠졌다 — 행 옆 Alert를
   * 찾으려면 페이지 맨 위부터 다시 탭해야 했다.
   */
  it("실패하면 제목으로 옮기지 않고 그 행의 Remove로 포커스를 돌려준다 — 행 옆 Alert가 답한다", async () => {
    const response = deferred<{ ok: false; error: string }>();
    mocks.changeMember.mockReturnValue(response.promise);
    await render(<Screen members={[owner, alice]} />);

    await click(byLabel("Remove Alice"));
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button')].find((b) => b.textContent === "Remove");
    if (!confirm) throw new Error("Missing confirm");
    await click(confirm);
    await response.resolve({ ok: false, error: "last-owner" });

    expect(document.activeElement).toBe(byLabel("Remove Alice"));
    expect(status()?.textContent).toBe("");
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe("Pending invitations — Revoke", () => {
  /** ⚠️ 위 `Members`와 같은 이유로 제목을 래퍼가 그리지 않는다 — 카드가 든다. */
  function Screen({ invitations }: { invitations: PendingInvitation[] }) {
    return <PendingInvitations slug="acme" invitations={invitations} role="OWNER" now={now} headingId="pending-heading" />;
  }

  it("마지막 초대를 지워 빈 상태로 접혀도 포커스는 제목, 알림은 같은 live 영역에 남는다", async () => {
    mocks.revokeInvitation.mockResolvedValue({ ok: true });
    const view = await render(<Screen invitations={[invite]} />);
    const region = status();
    expect(region?.textContent).toBe("");

    await click(byLabel("Revoke invitation for t***@example.com"));
    await confirmRevoke();
    await view.rerender(<Screen invitations={[]} />);

    expect(mocks.revokeInvitation).toHaveBeenCalledWith({ slug: "acme", invitationId: "i1" });
    expect(document.activeElement?.id).toBe("pending-heading");
    expect(status()).toBe(region);
    expect(status()?.textContent).toContain("t***@example.com");
  });

  /** ⚠️ `members`의 Remove와 같은 결함이다 (malmoi#53) — 누른 버튼이 `loading` 동안 `disabled`라 포커스를 잃는다. */
  it("실패하면 제목으로 옮기지 않고 그 행의 Revoke로 포커스를 돌려준다", async () => {
    const response = deferred<{ ok: false; error: string }>();
    mocks.revokeInvitation.mockReturnValue(response.promise);
    await render(<Screen invitations={[invite]} />);

    await click(byLabel("Revoke invitation for t***@example.com"));
    await confirmRevoke();
    await response.resolve({ ok: false, error: "unavailable" });

    expect(document.activeElement).toBe(byLabel("Revoke invitation for t***@example.com"));
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(status()?.textContent).toBe("");
  });
});
