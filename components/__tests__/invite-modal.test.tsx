// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InviteModal } from "@/components/members/invite-modal";
import { m } from "@/lib/i18n";

import { find, input, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ createInvitation: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ createInvitation: mocks.createInvitation }));

/**
 * **초대 모달의 두 얼굴** (members-rework T10).
 *
 * ⚠️ **사후 거부가 세 번째 얼굴이 아니다** — 폼에 머물며 입력값을 지킨다. 그 성질은 렌더로만 보인다.
 */
const noop = () => {};
const ref = { current: null };

const open = async () => {
  const { container } = await render(
    <InviteModal slug="acme" open onClose={noop} seats={{ n: 4, limit: 10 }} returnFocusRef={ref} />,
  );
  return container;
};
const panel = () => find<HTMLElement>(document.body, "[data-onboarding-panel]");
const submit = () => find<HTMLButtonElement>(panel(), 'button[type="submit"]');
const click = async (node: HTMLElement) => { await act(async () => { await userEvent.setup().click(node); }); };

beforeEach(() => { vi.clearAllMocks(); });

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
    // 포커스는 누른 제출 버튼으로 돌아간다 (malmoi#53).
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
});
