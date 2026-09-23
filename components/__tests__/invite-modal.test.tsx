// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InviteModal } from "@/components/members/invite-modal";
import { m } from "@/lib/i18n";

import { find, input, key, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ createInvitations: vi.fn(), toast: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ createInvitations: mocks.createInvitations }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));

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
 * **다중 초대 폼** (invitation-email T3.1 · 핸드오프 `Invite Modal.dc.html` `1a`–`1i`).
 *
 * 흐름은 하나다: 입력 → 전송 → 성공이면 닫힘 / 오류면 같은 폼. 결과 화면·링크 화면이 없다.
 */
const ref = { current: null } as { current: HTMLElement | null };
let onClose: ReturnType<typeof vi.fn<() => void>>;

const open = async () => {
  // 앞 테스트의 모달이 닫히며 돌려주는 포커스(매크로태스크)가 이 테스트로 넘어오지 않게 먼저 비운다.
  await settle();
  await render(<InviteModal slug="acme" open onClose={onClose} seats={{ n: 4, limit: 10 }} returnFocusRef={ref} />);
  await settle();
};
const panel = () => find<HTMLElement>(document.body, "[data-onboarding-panel]");
const submit = () => find<HTMLButtonElement>(panel(), 'button[type="submit"]');
const rows = () => [...panel().querySelectorAll<HTMLElement>("[data-recipient-row]")];
const email = (i: number) => find<HTMLInputElement>(rows()[i]!, 'input[inputmode="email"]');
const role = (i: number) => find<HTMLElement>(rows()[i]!, '[role="combobox"]');
const remove = (i: number) => find<HTMLButtonElement>(rows()[i]!, "button[data-remove]");
const reason = (i: number) => rows()[i]!.querySelector("[data-row-reason]")?.textContent ?? null;
const addAnother = () => [...panel().querySelectorAll("button")].find((b) => b.textContent === m.members.invite.addAnother) as HTMLButtonElement;
const status = () => find<HTMLElement>(panel(), "[data-invite-status]");
const formAlert = () => panel().querySelector<HTMLElement>("[data-form-alert] > div");
const closeButton = () => find<HTMLButtonElement>(document.body, `button[aria-label="${m.common.close}"]`);
const click = async (node: HTMLElement) => { await act(async () => { await userEvent.setup().click(node); }); };
/**
 * ⚠️ **Radix의 포커스 이동은 렌더 뒤 매크로태스크다** — `act`는 React만 비우므로 그 전에 단언하면
 * 통과·실패가 **실행마다 갈린다**(실측 3회 중 1회 red). 타이머를 한 번 비우고 본다.
 */
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
async function fill(values: string[]) {
  for (const [i, value] of values.entries()) {
    if (i >= rows().length) await click(addAnother());
    await input(email(i), value);
  }
}
async function pickOwner(i: number) {
  role(i).focus();
  await act(async () => { await userEvent.setup().keyboard("o"); });
}
async function paste(target: HTMLInputElement, text: string) {
  await act(async () => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.assign(event, { clipboardData: { getData: () => text } });
    target.dispatchEvent(event);
  });
}

let fixup: MutationObserver | undefined;
afterEach(() => { fixup?.disconnect(); fixup = undefined; });

beforeEach(() => {
  vi.clearAllMocks();
  onClose = vi.fn<() => void>();
  mocks.createInvitations.mockResolvedValue({ ok: true, count: 1 });
  fixup = installFocusFixup();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  ref.current = trigger;
});

describe("1a 입력 — 빈 행 하나", () => {
  it("제목·설명·열 머리·좌석이 시안 문구다", async () => {
    await open();
    const text = panel().textContent ?? "";
    expect(text).toContain(m.members.invite.title);
    expect(text).toContain(m.members.invite.description);
    expect(text).toContain(m.members.invite.columns.email);
    expect(text).toContain(m.members.invite.columns.role);
    expect(status().textContent).toBe(m.members.invite.seatsUsed(4, 10));
    expect(status().getAttribute("aria-live")).toBe("polite");
  });

  it("첫 이메일에 포커스가 선다", async () => {
    await open();
    expect(document.activeElement).toBe(email(0));
  });

  it("빈 폼에서는 주 버튼이 꺼져 있고 라벨이 Send invitations다", async () => {
    await open();
    expect(submit().disabled).toBe(true);
    expect(submit().textContent).toBe(m.members.invite.send(0));
  });

  it("한 행일 때 제거 버튼은 꺼진 채 자리를 지킨다", async () => {
    await open();
    expect(remove(0).disabled).toBe(true);
    expect(remove(0).getAttribute("aria-label")).toBe(m.members.invite.removeRecipient("recipient 1"));
  });

  /** ⚠️ 제출 버튼이 `<form>` 바깥이다 — `form=`이 없으면 버튼 제출이 조용히 죽는다 (POSTMORTEM 2026-09-08). */
  it("제출 버튼이 본문의 폼에 묶여 있다", async () => {
    await open();
    const form = find<HTMLFormElement>(panel(), "form");
    expect(submit().getAttribute("form")).toBe(form.id);
    expect(form.contains(submit())).toBe(false);
  });
});

describe("1b 입력 — 여러 명 · 역할 혼합", () => {
  it("주 버튼 라벨이 채운 행 수를 든다", async () => {
    await open();
    await fill(["a@x.com"]);
    expect(submit().textContent).toBe(m.members.invite.send(1));
    await fill(["a@x.com", "b@x.com", "c@x.com"]);
    expect(submit().textContent).toBe(m.members.invite.send(3));
    expect(m.members.invite.send(1)).toBe("Send invitation");
    expect(m.members.invite.send(3)).toBe("Send 3 invitations");
  });

  it("행마다 역할을 들고 빈 행은 보내지 않는다", async () => {
    await open();
    await fill(["a@x.com", "", " B@x.com "]);
    await pickOwner(2);
    await click(submit());
    expect(mocks.createInvitations).toHaveBeenCalledWith({
      slug: "acme",
      recipients: [
        { email: "a@x.com", role: "EDITOR" },
        { email: " B@x.com ", role: "OWNER" },
      ],
    });
  });

  it("역할 선택의 접근 이름에 대상 주소가 들어간다", async () => {
    await open();
    await fill(["mina@example.com"]);
    expect(role(0).getAttribute("aria-label")).toBe(m.members.invite.roleFor("mina@example.com"));
    expect(remove(0).getAttribute("aria-label")).toBe(m.members.invite.removeRecipient("mina@example.com"));
  });

  it("이메일에서 Enter는 아래에 행을 추가하고 그 입력으로 옮긴다 — 제출하지 않는다", async () => {
    await open();
    await fill(["a@x.com"]);
    await key(email(0), "Enter");
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(email(1));
    expect(mocks.createInvitations).not.toHaveBeenCalled();
  });

  it("IME 조합 중 Enter는 가로채지 않는다", async () => {
    await open();
    await fill(["가"]);
    await key(email(0), "Enter", { isComposing: true });
    expect(rows()).toHaveLength(1);
  });

  it("여러 주소 붙여 넣기는 행으로 펼쳐지고 포커스는 마지막 새 행이다", async () => {
    await open();
    await paste(email(0), "a@x.com, b@x.com\nc@x.com");
    expect(rows().map((_, i) => email(i).value)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(document.activeElement).toBe(email(2));
  });

  it("채운 행에 붙여 넣으면 그 뒤에 새 행으로 들어가고 기존 역할은 그대로다", async () => {
    await open();
    await fill(["keep@x.com"]);
    await pickOwner(0);
    await paste(email(0), "a@x.com b@x.com");
    expect(rows().map((_, i) => email(i).value)).toEqual(["keep@x.com", "a@x.com", "b@x.com"]);
    expect(role(0).textContent).toContain(m.projects.role.OWNER);
    expect(role(1).textContent).toContain(m.projects.role.EDITOR);
  });

  it("주소 하나 붙여 넣기는 평범한 붙여 넣기다", async () => {
    await open();
    await paste(email(0), "a@x.com");
    expect(rows()).toHaveLength(1);
  });

  it("행을 지우면 다음 행으로, 마지막 행이면 [Add another]로 포커스가 간다", async () => {
    await open();
    await fill(["a@x.com", "b@x.com", "c@x.com"]);
    await click(remove(0));
    expect(document.activeElement).toBe(email(0));
    expect(email(0).value).toBe("b@x.com");
    await click(remove(1));
    expect(document.activeElement).toBe(addAnother());
  });
});

describe("1c 입력 오류 — 제출 전 전체 검증", () => {
  it("형식·중복을 행 아래에 전부 적고 서버에 가지 않으며 첫 문제 행으로 간다", async () => {
    await open();
    await fill(["ok@x.com", "alex@example", "ok@x.com"]);
    await click(submit());
    expect(mocks.createInvitations).not.toHaveBeenCalled();
    expect(reason(0)).toBeNull();
    expect(reason(1)).toBe(m.members.invite.rowError.invalidEmail);
    expect(reason(2)).toBe(m.members.invite.rowError.duplicate(1));
    await settle();
    expect(document.activeElement).toBe(email(1));
    expect(submit().disabled).toBe(false);
  });

  it("같은 주소에 역할 둘이면 양쪽 행에 상대 행과 역할을 적는다", async () => {
    await open();
    await fill(["mina@example.com", "MINA@Example.com "]);
    await pickOwner(1);
    await click(submit());
    expect(reason(0)).toBe(m.members.invite.rowError.roleConflict(2, m.projects.role.OWNER));
    expect(reason(1)).toBe(m.members.invite.rowError.roleConflict(1, m.projects.role.EDITOR));
    expect(m.members.invite.rowError.roleConflict(2, "Owner")).toBe("Also in row 2 as Owner. Keep one role for this address.");
  });

  it("입력은 몰래 고치지 않는다 — 오류로 남은 폼의 표시는 원문이다", async () => {
    await open();
    await fill(["MINA@Example.com ", "bad"]);
    await click(submit());
    expect(email(0).value).toBe("MINA@Example.com ");
  });

  it("고치면 그 행의 사유만 사라진다", async () => {
    await open();
    await fill(["bad", "also-bad"]);
    await click(submit());
    await input(email(0), "good@x.com");
    expect(reason(0)).toBeNull();
    expect(reason(1)).toBe(m.members.invite.rowError.invalidEmail);
  });

  it("오류 행을 지워도 성공 표시가 남지 않는다", async () => {
    await open();
    await fill(["ok@x.com", "bad"]);
    await click(submit());
    await click(remove(1));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(submit().textContent).toBe(m.members.invite.send(1));
  });
});

describe("1d 전송 중 — 전부 잠긴다", () => {
  it("입력·역할·제거·추가·닫기가 잠기고 바닥이 Sending invitations…다", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.createInvitations.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    await open();
    await fill(["a@x.com", "b@x.com"]);
    await click(submit());
    expect(email(0).disabled).toBe(true);
    expect(role(0).getAttribute("aria-disabled") === "true" || role(0).hasAttribute("disabled")).toBe(true);
    expect(remove(0).disabled).toBe(true);
    expect(addAnother().disabled).toBe(true);
    expect(closeButton().disabled).toBe(true);
    expect(submit().disabled).toBe(true);
    expect(submit().textContent).toContain(m.members.invite.send(2));
    expect(status().textContent).toBe(m.members.invite.sending);
    await act(async () => { resolve({ ok: true, count: 2 }); });
  });
});

describe("1e 성공 — 닫힘 + 토스트", () => {
  it.each([
    [1, "Invitation sent"],
    [3, "Invitations sent to 3 people"],
  ])("%i명 접수면 토스트 %s 후 닫힌다", async (count, text) => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: true, count });
    await open();
    await fill(Array.from({ length: count }, (_, i) => `u${i}@x.com`));
    await click(submit());
    expect(mocks.toast).toHaveBeenCalledWith(text);
    expect(m.members.invite.sentToast(count)).toBe(text);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("1f 서버 거부 — 그 행 아래", () => {
  it("이미 멤버는 원래 행 아래에 서고 바닥이 이번 요청은 아무것도 안 보냈다고 말한다", async () => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error: "invalid-rows", rowErrors: [{ index: 1, code: "already-member" }] });
    await open();
    // 가운데 빈 행은 보내지 않으므로 서버의 index 1은 화면의 셋째 행이다.
    await fill(["a@x.com", "", "member@x.com"]);
    await click(submit());
    await settle();
    expect(reason(2)).toBe(m.members.invite.alreadyMember);
    expect(reason(0)).toBeNull();
    expect(status().textContent).toBe(m.members.invite.nothingSent);
    expect(m.members.invite.nothingSent).toBe("Nothing was sent by this request. Fix or remove the highlighted row, then send again.");
    expect(document.activeElement).toBe(email(2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("문제 행을 고치면 바닥이 좌석 수로 돌아간다", async () => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error: "invalid-rows", rowErrors: [{ index: 0, code: "already-member" }] });
    await open();
    await fill(["member@x.com"]);
    await click(submit());
    await input(email(0), "new@x.com");
    expect(status().textContent).toBe(m.members.invite.seatsUsed(4, 10));
  });
});

describe("1g·1h 폼 Alert — 같은 자리 하나", () => {
  const RETRY = "2026-09-23T12:00:30.000Z";

  it("프로젝트 한도는 warning이고 서버 수·시각을 문장으로 적는다", async () => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error: "rate-limited", retryAt: RETRY, limit: "project", used: 18 });
    await open();
    await fill(["a@x.com", "b@x.com", "c@x.com"]);
    await click(submit());
    await settle();
    const alert = formAlert();
    expect(alert?.textContent).toContain(m.members.invite.limit.title);
    expect(alert?.textContent).toContain(m.members.invite.limit.project(18, 3, "2026-09-23 12:01 UTC"));
    expect(alert?.className).toContain("amber");
    expect(email(2).value).toBe("c@x.com");
    expect(document.activeElement).toBe(submit());
  });

  it("주소 간격 제한은 그 행의 주소를 문장에 넣는다", async () => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error: "rate-limited", retryAt: RETRY, limit: "address", index: 1 });
    await open();
    await fill(["a@x.com", "mina@example.com"]);
    await click(submit());
    expect(formAlert()?.textContent).toContain(m.members.invite.limit.address("mina@example.com", "2026-09-23 12:01 UTC"));
  });

  it("결과 미확인은 warning이고 일부가 갔을 수 있다고 말한다", async () => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error: "email-unknown", retryAt: RETRY });
    await open();
    await fill(["a@x.com"]);
    await click(submit());
    expect(formAlert()?.textContent).toContain(m.members.invite.unconfirmed.title);
    expect(formAlert()?.textContent).toContain(m.members.invite.unconfirmed.body);
    expect(formAlert()?.className).toContain("amber");
  });

  it.each([
    ["email-rejected", () => m.members.invite.sendFailed],
    ["email-unavailable", () => m.members.invite.emailUnavailable],
  ])("%s는 danger다", async (error, text) => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error, retryAt: RETRY });
    await open();
    await fill(["a@x.com"]);
    await click(submit());
    expect(formAlert()?.textContent).toContain(text());
    expect(formAlert()?.getAttribute("role")).toBe("alert");
  });

  it("메일 설정 없음 문구에 workspace가 없다", () => {
    expect(m.members.invite.emailUnavailable).toBe("Email is unavailable right now. Try again later.");
  });

  it("Action 호출 자체가 실패하면 결과 미확인이고 잠금이 풀린다", async () => {
    mocks.createInvitations.mockRejectedValueOnce(new Error("network"));
    await open();
    await fill(["a@x.com"]);
    await click(submit());
    await settle();
    expect(formAlert()?.textContent).toContain(m.members.invite.unconfirmed.title);
    expect(email(0).disabled).toBe(false);
    expect(document.activeElement).toBe(submit());
  });

  it("다시 제출하면 Alert가 지워진다", async () => {
    mocks.createInvitations.mockResolvedValueOnce({ ok: false, error: "email-rejected", retryAt: RETRY });
    await open();
    await fill(["a@x.com"]);
    await click(submit());
    expect(formAlert()).not.toBeNull();
    await click(submit());
    expect(onClose).toHaveBeenCalled();
  });
});
