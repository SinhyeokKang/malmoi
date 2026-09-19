// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberList } from "@/components/members/member-list";
import { MembersPanelHeader } from "@/components/members/members-panel-header";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { MEMBER_LIMIT } from "@/lib/auth/invitation";
import { accessErrorMessage } from "@/lib/auth/message";
import { planSeatNotice } from "@/lib/auth/seat-notice";
import type { MemberView, PendingInvitation } from "@/lib/auth/query";
import type { Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ changeMember: vi.fn(), revokeInvitation: vi.fn(), createInvitation: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => mocks);
const { changeMember } = mocks;

beforeEach(() => { vi.clearAllMocks(); });

/**
 * **spec §6 상태 표의 Members 카드 갈래** (members-rework).
 *
 * ⚠️ **사전 차단과 서버 거부의 문구 동일성을 여기서 센다.** 소스 스캔으로는 못 센다 —
 * `expect(src).toContain("accessErrorMessage")`는 **오늘 이미 green**이고(파일에 그 호출이 있다),
 * POSTMORTEM 2026-09-18이 정확히 그 판정을 기각했다: *"인가 방어선이 호출이 아니라 이름을 셌다"*.
 * 렌더해서 **문자열을 견준다.**
 */
const now = new Date("2026-09-17T00:00:00Z");
const member = (over: Partial<MemberView> & { userId: string }): MemberView => ({
  name: `Name ${over.userId}`,
  emailLabel: `${over.userId}***@acme.com`,
  readable: true,
  role: "EDITOR",
  joinedAt: now,
  ...over,
});

const draw = async (members: MemberView[], role: Role = "OWNER") => {
  const { container } = await render(
    <MemberList slug="acme" members={members} role={role} viewerId="u1" now={now} headingId="members-heading" />,
  );
  return container;
};

const rows = (container: HTMLElement) => [...container.querySelectorAll("li")];
const bands = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[id^="band-"]')];

const owner = member({ userId: "u1", role: "OWNER" });
const second = member({ userId: "u2", role: "OWNER" });
const editor = member({ userId: "u3", role: "EDITOR" });

describe("#1 OWNER · 정상", () => {
  it("행마다 셀렉트와 [Remove]가 선다", async () => {
    const container = await draw([owner, second, editor]);
    expect(rows(container)).toHaveLength(3);
    expect(container.querySelectorAll('[aria-label^="Remove "]')).toHaveLength(3);
    expect(bands(container)).toHaveLength(0);
  });

  it("카드 배지가 멤버 수를 말한다 — `projects`의 문장을 물려받지 않는다", async () => {
    const container = await draw([owner, second]);
    expect(find(container, "h2 + span .sr-only").textContent).toBe(m.members.count(2));
  });
});

describe("#2 OWNER · 오너 1명", () => {
  it("그 행만 셀렉트·[Remove]가 꺼지고 행 아래 띠가 사유를 든다", async () => {
    const container = await draw([owner, editor]);
    expect(bands(container)).toHaveLength(1);
    const blocked = rows(container)[0]!;
    expect(blocked.querySelector('[role="combobox"]')?.getAttribute("aria-disabled")).toBe("true");
    expect(blocked.querySelector('[aria-label^="Remove "]')?.getAttribute("aria-disabled")).toBe("true");
    // 다른 행은 그대로다 — 판정이 행 단위라는 것이 요지다.
    expect(rows(container)[1]!.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  /**
   * ⚠️ **진짜 `disabled`면 사유가 영영 낭독되지 않는다** — 포커스를 못 받는 요소의
   * `aria-describedby`는 전달 경로가 없다.
   */
  it("꺼진 컨트롤 둘이 그 띠를 가리키고, 진짜 `disabled`가 아니다", async () => {
    const container = await draw([owner, editor]);
    const band = bands(container)[0]!;
    const blocked = rows(container)[0]!;
    for (const selector of ['[role="combobox"]', '[aria-label^="Remove "]']) {
      const control = find<HTMLElement>(blocked, selector);
      expect(control.getAttribute("aria-describedby"), selector).toBe(band.id);
      expect(control.hasAttribute("disabled"), selector).toBe(false);
    }
  });

  /**
   * ⚠️ **속성만 보면 이 결함에 green이다** (2026-09-19 code-review 🔴1). Radix `Select.Trigger`의
   * `pointerTypeRef`는 **`useRef("touch")`로 시작**하고 그것을 `"mouse"`로 바꾸는 코드가 Radix 자신의
   * `onPointerDown` **첫 줄**이다 — 우리가 그 핸들러를 `preventDefault`로 건너뛰면 ref가 영원히
   * `"touch"`고, 이어지는 `onClick`이 `pointerTypeRef.current !== "mouse"`를 보고 **연다.**
   * 즉 꺼진 것처럼 보이는 셀렉트가 **마우스 클릭으로 그냥 열렸다.**
   */
  it("꺼진 셀렉트가 마우스 클릭으로 열리지 않는다", async () => {
    const container = await draw([owner, editor]);
    const trigger = find<HTMLElement>(rows(container)[0]!, '[role="combobox"]');
    await act(async () => { await userEvent.setup().click(trigger); });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  /**
   * ⚠️ **타이프어헤드는 열지 않고 값을 바꾼다** (code-review 🔴2). Radix 트리거의 `onKeyDown`이
   * `event.key.length === 1`이면 `handleTypeaheadSearch`를 **`OPEN_KEYS` 판정보다 먼저** 부른다 —
   * 여는 키 넷만 막으면 나머지 한 글자가 전부 통과해 `onValueChange`가 발사된다.
   */
  it("꺼진 셀렉트가 타이프어헤드로 역할을 바꾸지 않는다", async () => {
    const container = await draw([owner, editor]);
    const trigger = find<HTMLElement>(rows(container)[0]!, '[role="combobox"]');
    trigger.focus();
    await act(async () => { await userEvent.setup().keyboard("e"); });
    expect(changeMember).not.toHaveBeenCalled();
    expect(trigger.textContent).toContain(m.projects.role.OWNER);
  });

  /** **이 단언이 이 기능의 실질 위험을 막는다** — 같은 상황에 두 문장이 서는 것. */
  it("띠 문구가 서버 거부 문구와 같은 문자열이다", async () => {
    const container = await draw([owner, editor]);
    expect(bands(container)[0]!.textContent).toBe(accessErrorMessage("last-owner"));
  });
});

describe("#5 · #6 복호화 실패 행", () => {
  it("행이 목록에 남고 전용 문구와 띠가 선다 — 역할·가입일은 정상이다", async () => {
    const container = await draw([owner, member({ userId: "u2", readable: false })]);
    expect(rows(container)).toHaveLength(2);
    const broken = rows(container)[1]!;
    expect(find(broken, "[data-primary]").textContent).toContain(m.members.unreadableLabel);
    expect(broken.querySelector("[data-secondary]")).toBeNull();
    expect(find<HTMLElement>(broken, '[id^="band-"]').textContent).toBe(m.members.unreadableHint);
    // 역할 컨트롤은 정상으로 선다 — 못 읽은 것은 PII뿐이다.
    expect(broken.querySelector('[role="combobox"]')?.getAttribute("aria-disabled")).toBeNull();
  });

  /** ⚠️ **한 행에 띠는 항상 하나다** — 둘이면 `aria-describedby`가 어느 쪽을 가리킬지 정해야 한다. */
  it("못 읽음 + 마지막 오너가 겹치면 띠 하나에 문장 둘이다", async () => {
    const container = await draw([member({ userId: "u1", role: "OWNER", readable: false }), editor]);
    const band = bands(container)[0]!;
    expect(bands(container)).toHaveLength(1);
    expect(band.textContent).toContain(m.members.unreadableHint);
    expect(band.textContent).toContain(accessErrorMessage("last-owner"));
    // 순서가 못 읽음 → 마지막 오너다.
    expect(band.textContent!.indexOf(m.members.unreadableHint)).toBeLessThan(
      band.textContent!.indexOf(accessErrorMessage("last-owner")),
    );
  });
});

describe("#7 · #9 EDITOR 시야", () => {
  /**
   * ⚠️ **컨트롤이 사라지지 않는다** — 감추면 오른쪽 끝이 통째로 비어 같은 화면을 보는 OWNER와 말을
   * 맞출 수 없다. 형이 "바꿀 수 있었는데 잠겨 있다"를 말한다.
   */
  it("역할이 자물쇠 칩이고 [Remove]가 없다", async () => {
    const container = await draw([owner, editor], "EDITOR");
    expect(container.querySelectorAll("[data-role-chip]")).toHaveLength(2);
    expect(container.querySelector('[aria-label^="Remove "]')).toBeNull();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
  });

  it("칩이 대상과 잠김 사유를 낭독한다", async () => {
    const container = await draw([owner], "EDITOR");
    expect(find(container, "[data-role-chip]").textContent).toContain(m.members.roleLocked("Name u1"));
  });

  /** ⚠️ **오너가 하나여도 띠를 안 그린다** — EDITOR에게는 그 사유가 설명할 행동이 없다. */
  it("오너가 하나여도 띠를 그리지 않는다", async () => {
    const container = await draw([owner, editor], "EDITOR");
    expect(bands(container)).toHaveLength(0);
  });

  /** ⚠️ **못 읽음은 EDITOR에게도 보인다** — 막힌 행동이 아니라 행이 그렇게 보이는 이유를 말한다. */
  it("못 읽은 행의 사유는 EDITOR도 본다", async () => {
    const container = await draw([owner, member({ userId: "u2", readable: false })], "EDITOR");
    expect(bands(container)).toHaveLength(1);
    expect(bands(container)[0]!.textContent).toBe(m.members.unreadableHint);
  });
});

/**
 * **spec §6 상태 표의 Pending 카드 갈래.**
 */
const invitation = (over: Partial<PendingInvitation> & { id: string }): PendingInvitation => ({
  emailLabel: `${over.id}***@acme.com`,
  readable: true,
  role: "EDITOR",
  expiresAt: new Date("2026-09-24T00:00:00Z"),
  invitedByName: "Owner",
  ...over,
});

const drawPending = async (invitations: PendingInvitation[], role: Role = "OWNER") => {
  const { container } = await render(
    <PendingInvitations slug="acme" invitations={invitations} role={role} now={now} headingId="pending-heading" />,
  );
  return container;
};

describe("Pending — 역할은 바꿀 수 없다", () => {
  /** ⚠️ **OWNER에게도 셀렉트를 안 준다** — 발급된 초대의 역할은 철회 후 재발급으로만 바뀐다. */
  it("전원 자물쇠 칩이고 셀렉트가 없다", async () => {
    const container = await drawPending([invitation({ id: "i1" }), invitation({ id: "i2", role: "OWNER" })]);
    expect(container.querySelectorAll("[data-role-chip]")).toHaveLength(2);
    expect(container.querySelector('[role="combobox"]')).toBeNull();
  });

  it("OWNER에게는 [Revoke]가 있고 EDITOR에게는 없다", async () => {
    const owned = await drawPending([invitation({ id: "i1" })]);
    expect(owned.querySelectorAll('[aria-label^="Revoke "]')).toHaveLength(1);
    const read = await drawPending([invitation({ id: "i1" })], "EDITOR");
    expect(read.querySelector('[aria-label^="Revoke "]')).toBeNull();
  });
});

describe("#4 Pending 0건", () => {
  /** ⚠️ **버튼이 없다** — 여기서 할 일은 헤더의 [Invite]이고, 카드가 그것을 두 번 말하지 않는다. */
  it("빈 상태가 카드 안에 서고 출구 버튼이 없다", async () => {
    const container = await drawPending([]);
    expect(container.textContent).toContain(m.members.pending.empty.title);
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  /** ⚠️ **live 영역이 빈 상태 갈래 밖이다** — 마지막 초대를 지운 알림이 그 접힘과 함께 사라지면 안 된다. */
  it("빈 상태로 접혀도 live 영역이 남는다", async () => {
    const container = await drawPending([]);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it("배지가 초대 수를 말한다 — `projects`의 문장을 물려받지 않는다", async () => {
    const container = await drawPending([]);
    expect(find(container, "h2 + span .sr-only").textContent).toBe(m.members.pending.count(0));
  });
});

describe("Pending — 못 읽은 초대", () => {
  /** ⚠️ **행을 숨기지 않는다** — 철회는 id로 되므로 못 읽은 초대도 걷어낼 수 있어야 한다. */
  it("행이 남고 전용 문구와 띠가 선다", async () => {
    const container = await drawPending([invitation({ id: "i1", readable: false })]);
    const row = find<HTMLElement>(container, "li");
    expect(find(row, "[data-primary]").textContent).toContain(m.members.unreadableLabel);
    expect(find<HTMLElement>(row, '[id^="band-"]').textContent).toBe(m.members.unreadableHint);
    expect(row.querySelector('[aria-label^="Revoke "]')).not.toBeNull();
  });
});

/**
 * **패널 머리 — spec §6의 좌석·역할 갈래** (#1 · #3 · #7 · #8).
 */
const drawHeader = async (role: Role, memberCount: number) => {
  const { container } = await render(
    <MembersPanelHeader slug="acme" notice={planSeatNotice({ role, memberCount })} />,
  );
  return container;
};
const invite = (container: HTMLElement) => find<HTMLButtonElement>(container, "button");

describe("#1 · #3 패널 머리 — OWNER", () => {
  it("자리가 남으면 잔량을 말하고 [Invite]가 열린다", async () => {
    const container = await drawHeader("OWNER", 4);
    expect(container.textContent).toContain(m.members.seats(4, MEMBER_LIMIT));
    expect(invite(container).getAttribute("aria-disabled")).toBeNull();
  });

  /**
   * ⚠️ **진짜 `disabled`가 아니다** — 포커스를 못 받으면 `aria-describedby`의 전달 경로가 없고,
   * 시안이 요구하는 "꺼진 버튼에는 반드시 이유"가 성립하지 않는다.
   */
  it("좌석이 차면 사유와 함께 꺼지고, 그 사유를 버튼이 가리킨다", async () => {
    const container = await drawHeader("OWNER", MEMBER_LIMIT);
    const button = invite(container);
    expect(container.textContent).toContain(m.members.seatsFull(MEMBER_LIMIT));
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(m.members.seatsFull(MEMBER_LIMIT));
  });

  /** ⚠️ **열 창이 없는 갈래에는 모달을 세우지 않는다.** */
  it("좌석이 차면 눌러도 창이 열리지 않는다", async () => {
    const container = await drawHeader("OWNER", MEMBER_LIMIT);
    await act(async () => { invite(container).click(); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("#7 · #8 패널 머리 — EDITOR", () => {
  it("역할 사유가 서고 [Invite]는 꺼진 채 남는다", async () => {
    const container = await drawHeader("EDITOR", 4);
    expect(container.textContent).toContain(m.members.ownerOnly);
    expect(invite(container).getAttribute("aria-disabled")).toBe("true");
  });

  /** ⚠️ **이 단언이 열린 결정 하나를 닫는다** — 좌석을 비워도 EDITOR는 초대할 수 없다. */
  it("좌석이 차 있어도 역할 사유가 이긴다", async () => {
    const container = await drawHeader("EDITOR", MEMBER_LIMIT);
    expect(container.textContent).toContain(m.members.ownerOnly);
    expect(container.textContent).not.toContain(m.members.seatsFull(MEMBER_LIMIT));
  });
});
