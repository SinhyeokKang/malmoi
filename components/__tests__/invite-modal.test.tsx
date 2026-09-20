// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InviteModal } from "@/components/members/invite-modal";
import { m } from "@/lib/i18n";

import { find, input, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ createInvitation: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ createInvitation: mocks.createInvitation }));

/**
 * ⚠️ **jsdom에는 HTML의 focus fixup 규칙이 없다** — 포커스된 버튼이 `disabled`가 되면 브라우저는
 * `activeElement`를 `body`로 돌리지만 jsdom은 그대로 둔다. 그래서 **아무것도 안 해도** "포커스가 제출
 * 버튼에 있다"가 참이 되고, 복귀 로직을 통째로 지워도 green이다 (malmoi#64에서 실제로 그랬다 —
 * 브라우저에서는 포커스가 모달 패널에 떨어져 있었다).
 *
 * `members-focus.test.tsx`가 같은 이유로 쓰는 관용구를 그대로 가져온다.
 */
function installFocusFixup(): MutationObserver {
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    // jsdom의 `blur()`는 포커스 가능한 요소에서만 돈다 — 속성을 잠깐 걷어야 풀린다.
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  return observer;
}

/**
 * **초대 모달의 두 얼굴** (members-rework T10).
 *
 * ⚠️ **사후 거부가 세 번째 얼굴이 아니다** — 폼에 머물며 입력값을 지킨다. 그 성질은 렌더로만 보인다.
 */
const noop = () => {};
const ref = { current: null } as { current: HTMLElement | null };

const open = async (onClose: () => void = noop) => {
  const { container } = await render(
    <InviteModal slug="acme" open onClose={onClose} seats={{ n: 4, limit: 10 }} returnFocusRef={ref} />,
  );
  return container;
};
const panel = () => find<HTMLElement>(document.body, "[data-onboarding-panel]");
const submit = () => find<HTMLButtonElement>(panel(), 'button[type="submit"]');
const click = async (node: HTMLElement) => { await act(async () => { await userEvent.setup().click(node); }); };
/**
 * ⚠️ **Radix의 포커스 복귀는 렌더 뒤 매크로태스크다** — `act`는 React만 비우므로 그 전에 단언하면
 * 통과·실패가 **실행마다 갈린다**(실측 3회 중 1회 red). 타이머를 한 번 비우고 본다.
 */
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

let fixup: MutationObserver | undefined;
afterEach(() => { fixup?.disconnect(); fixup = undefined; });

beforeEach(() => {
  vi.clearAllMocks();
  fixup = installFocusFixup();
  // 모달이 포커스를 돌려줄 대상 — 실제 화면에서는 패널 머리의 [Invite]다.
  const trigger = document.createElement("button");
  document.body.append(trigger);
  ref.current = trigger;
});

describe("얼굴 ① 폼", () => {
  it("좌석 사용량이 바닥에 서고 제목이 역할을 특정하지 않는다", async () => {
    await open();
    expect(panel().textContent).toContain(m.members.invite.seatsUsed(4, 10));
    expect(panel().textContent).toContain(m.members.invite.title);
  });

  /**
   * ⚠️ **제출 버튼이 `<form>` 바깥이다** — 모달 바닥은 본문의 형제라 `form=`이 없으면 Enter가
   * 조용히 죽는다 (POSTMORTEM 2026-09-08). 렌더로 그 연결을 직접 본다.
   */
  it("제출 버튼이 본문의 폼에 실제로 묶여 있다", async () => {
    await open();
    const form = find<HTMLFormElement>(panel(), "form");
    expect(form.id).not.toBe("");
    expect(submit().getAttribute("form")).toBe(form.id);
    expect(form.contains(submit())).toBe(false);
  });

  /** ⚠️ **기본이 Editor다** — 초대의 절대다수이고, Owner는 고른 사람만 만든다. */
  it("역할 기본값이 Editor이고 고른 값이 그대로 간다", async () => {
    mocks.createInvitation.mockResolvedValue({ ok: false, error: "unavailable" });
    await open();
    await input(find<HTMLInputElement>(panel(), "#invite-email"), "new@acme.com");
    await click(submit());
    expect(mocks.createInvitation).toHaveBeenCalledWith({ slug: "acme", email: "new@acme.com", role: "EDITOR" });

    await click(find<HTMLElement>(panel(), "#invite-role-OWNER"));
    await click(submit());
    expect(mocks.createInvitation).toHaveBeenLastCalledWith({ slug: "acme", email: "new@acme.com", role: "OWNER" });
  });

  /** ⚠️ **입력값을 지킨다** — 세 번째 얼굴을 만들면 다시 타이핑하게 된다. */
  it("사후 거부가 본문 맨 아래 Alert으로 서고 입력값이 남는다", async () => {
    mocks.createInvitation.mockResolvedValue({ ok: false, error: "already-member" });
    await open();
    await input(find<HTMLInputElement>(panel(), "#invite-email"), "taken@acme.com");
    await click(submit());

    expect(find(panel(), '[role="alert"]').textContent).toContain(m.members.invite.alreadyMember);
    expect(find<HTMLInputElement>(panel(), "#invite-email").value).toBe("taken@acme.com");
    /**
     * 포커스는 누른 제출 버튼으로 돌아간다 (malmoi#53 · malmoi#64).
     *
     * ⚠️ **`pending`이 풀린 뒤라야 한다.** `pending`은 `useTransition`의 값이라 `setError`가 커밋되는
     * 시점에도 아직 true다 — 그때 `focus()`를 부르면 버튼이 여전히 `disabled`라 **조용히 무시된다.**
     * 위 fixup이 없으면 jsdom은 포커스를 그대로 둬서 이 단언이 **아무것도 안 재고** 통과한다.
     */
    await settle();
    expect(submit().disabled).toBe(false);
    expect(document.activeElement).toBe(submit());
  });
});

describe("얼굴 ② 링크", () => {
  const issue = async () => {
    mocks.createInvitation.mockResolvedValue({ ok: true, token: "t0", label: "n***@acme.com" });
    await open();
    await input(find<HTMLInputElement>(panel(), "#invite-email"), "new@acme.com");
    await click(submit());
  };

  /** ⚠️ **라벨은 서버가 만든다** — 클라이언트에서 다시 가리면 세 번째 마스킹 구현이다. */
  it("제목이 서버가 준 라벨을 그대로 쓴다", async () => {
    await issue();
    expect(panel().textContent).toContain(m.members.invite.ready("n***@acme.com"));
  });

  it("폼이 사라지고 바닥이 만료·역할로 바뀐다", async () => {
    await issue();
    expect(panel().querySelector("form")).toBeNull();
    expect(panel().textContent).toContain(m.members.invite.expiresIn(m.projects.role.EDITOR));
    expect(panel().textContent).toContain(m.members.invite.notKept.title);
  });

  /** ⚠️ **링크가 `routes.invite`에서 온다** — 문자열로 조립하면 라우트를 옮겨도 조용히 404가 된다. */
  it("링크가 이 오리진의 초대 경로다", async () => {
    await issue();
    expect(panel().textContent).toContain(`${window.location.origin}/invite/t0`);
  });

  /** ⚠️ **mono가 아니다** — [Copy]가 붙은 값은 사람이 옮겨 적지 않는다 (DESIGN §4.1). */
  it("링크 줄이 mono가 아니다", async () => {
    await issue();
    expect(panel().innerHTML).not.toContain("text-mono");
  });

  /**
   * ⚠️ **닫을 때 얼굴도 함께 바뀐다** — `close()`가 `setIssued(null)`과 `onClose()`를 한 배치에서 부르므로
   * Radix `Content`는 "링크 얼굴에서 닫힌다"가 아니라 "폼 얼굴이 되면서 닫힌다"를 본다. 그 전이에서
   * `onCloseAutoFocus`가 안 돌면 포커스가 `body`로 빠진다 (malmoi#51 · #53과 같은 축).
   */
  it("[Done]으로 닫으면 포커스가 [Invite]로 돌아간다", async () => {
    const onClose = vi.fn();
    mocks.createInvitation.mockResolvedValue({ ok: true, token: "t0", label: "n***@acme.com" });
    const { rerender } = await render(
      <InviteModal slug="acme" open onClose={onClose} seats={{ n: 4, limit: 10 }} returnFocusRef={ref} />,
    );
    await input(find<HTMLInputElement>(panel(), "#invite-email"), "new@acme.com");
    await click(submit());

    const done = [...panel().querySelectorAll("button")].find((b) => b.textContent === m.members.invite.done);
    if (!done) throw new Error("Missing Done");
    await click(done);
    expect(onClose).toHaveBeenCalled();
    // 부모가 `open`을 내리는 것까지 재현한다 — 그 렌더에서 Radix가 닫기 전이를 돈다.
    await rerender(
      <InviteModal slug="acme" open={false} onClose={onClose} seats={{ n: 4, limit: 10 }} returnFocusRef={ref} />,
    );
    await settle();
    expect(document.activeElement).toBe(ref.current);
  });
});
