// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { MemberRow } from "@/components/members/member-row";
import { RoleChip } from "@/components/members/role-chip";
import { planMemberIdentity } from "@/lib/auth/member-identity";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

/**
 * **두 카드가 공유하는 행 껍데기와 읽기전용 칩** (members-rework T6 · DESIGN §6.65).
 *
 * ⚠️ **새 접근성 방어선 둘이 여기 선다** — 사유 띠의 `aria-describedby` 배선과 칩의 접근 이름.
 * POSTMORTEM 2026-09-14가 *"방어선 셋을 세웠는데 셋 다 지워도 green이었다"*라, 아래 단언들은
 * **뮤테이션으로 red를 확인**한 것만 남겼다.
 */
/** 띠는 `BannerLine` 프리미티브가 그리므로 마커가 아니라 **행이 만든 id**로 집는다. */
const BAND = '[id^="band-"]';

const identity = (name: string | null, emailLabel: string | null, readable = true) =>
  planMemberIdentity({ name, emailLabel, readable });

describe("MemberRow — 아바타 씨앗", () => {
  it("이름이 있으면 이니셜이 선다", async () => {
    const { container } = await render(<MemberRow id="u1" identity={identity("Jane", "j***@acme.com")} />);
    expect(find(container, "[data-avatar]").textContent).toBe("J");
  });

  /**
   * ⚠️ **씨앗이 없으면 이니셜 없는 중립 원이다.** 마스킹 주소의 첫 글자(`j`)를 쓰면 셸 아바타와
   * 다른 글자·다른 색이 되어 **아바타가 사람을 못 가리킨다** (`entity-card.tsx`가 밟은 함정).
   */
  it("씨앗이 없으면 글자 없는 중립 원이다", async () => {
    for (const row of [identity(null, "j***@acme.com"), identity(null, null), identity("Jane", "j***@x.com", false)]) {
      const { container } = await render(<MemberRow id="u1" identity={row} />);
      expect(find(container, "[data-avatar]").textContent).toBe("");
    }
  });
});

describe("MemberRow — 두 줄과 자기 표식", () => {
  it("이름이 1행이고 마스킹 주소가 2행이다", async () => {
    const { container } = await render(<MemberRow id="u1" identity={identity("Jane", "j***@acme.com")} />);
    expect(find(container, "[data-primary]").textContent).toContain("Jane");
    expect(find(container, "[data-secondary]").textContent).toBe("j***@acme.com");
  });

  it("2행이 없으면 그 자리를 그리지 않는다 — 빈 줄이 행 높이만 늘린다", async () => {
    const { container } = await render(<MemberRow id="u1" identity={identity(null, "j***@acme.com")} />);
    expect(find(container, "[data-primary]").textContent).toBe("j***@acme.com");
    expect(container.querySelector("[data-secondary]")).toBeNull();
  });

  /** ⚠️ **자기 표식은 `planMemberIdentity` 밖이다** — 갈래 넷과 직교라 행 껍데기가 든다. */
  it("자기 행에만 You 표식이 붙는다", async () => {
    const mine = await render(<MemberRow id="u1" identity={identity("Jane", null)} you />);
    expect(find(mine.container, "[data-primary]").textContent).toContain(m.members.you);
    const theirs = await render(<MemberRow id="u2" identity={identity("Ann", null)} />);
    expect(find(theirs.container, "[data-primary]").textContent).not.toContain(m.members.you);
  });
});

describe("MemberRow — 사유 띠와 aria-describedby", () => {
  /**
   * ⚠️ **`disabled`를 쓰면 사유가 영영 낭독되지 않는다** — 포커스를 못 받는 요소의 `aria-describedby`는
   * 전달 경로가 없다. 그래서 꺼진 컨트롤은 `aria-disabled`이고, **그 배선을 행 껍데기가 든다**.
   */
  it("띠가 있으면 컨트롤이 그 띠를 가리킨다", async () => {
    const { container } = await render(
      <MemberRow
        id="u9"
        identity={identity("Jane", null)}
        band="A project needs one owner."
        controls={(describedBy) => <button type="button" aria-disabled="true" aria-describedby={describedBy}>Remove</button>}
      />,
    );
    const band = find<HTMLElement>(container, BAND);
    const control = find<HTMLElement>(container, "button");
    expect(band.id).not.toBe("");
    expect(control.getAttribute("aria-describedby")).toBe(band.id);
  });

  it("띠가 없으면 가리킬 것도 없다 — 빈 id를 남기지 않는다", async () => {
    const { container } = await render(
      <MemberRow
        id="u9"
        identity={identity("Jane", null)}
        controls={(describedBy) => <button type="button" aria-describedby={describedBy}>Remove</button>}
      />,
    );
    expect(container.querySelector(BAND)).toBeNull();
    expect(find<HTMLElement>(container, "button").hasAttribute("aria-describedby")).toBe(false);
  });

  /** ⚠️ **행마다 다른 id여야 한다** — 같은 id가 둘이면 `getElementById`가 첫 행만 답한다. */
  it("띠 id가 행 id에서 나온다", async () => {
    const a = await render(<MemberRow id="u1" identity={identity("A", null)} band="x" />);
    const b = await render(<MemberRow id="u2" identity={identity("B", null)} band="x" />);
    expect(find<HTMLElement>(a.container, BAND).id).not.toBe(find<HTMLElement>(b.container, BAND).id);
  });

  /**
   * ⚠️ **한 행에 띠는 항상 하나다** — 못 읽음과 마지막 오너가 겹치면 문장 둘을 한 띠에 싣는다.
   * 띠가 둘이면 `aria-describedby`가 어느 쪽을 가리킬지 정해야 하고, 그 판정이 화면마다 갈린다.
   */
  it("문장이 둘이어도 띠는 하나다", async () => {
    const { container } = await render(
      <MemberRow id="u1" identity={identity("A", null, false)} band={<>{m.members.unreadableHint} {m.errors.access["last-owner"]}</>} />,
    );
    expect(container.querySelectorAll(BAND)).toHaveLength(1);
    expect(find(container, BAND).textContent).toContain(m.members.unreadableHint);
    expect(find(container, BAND).textContent).toContain(m.errors.access["last-owner"]);
  });
});

describe("RoleChip", () => {
  /**
   * ⚠️ **역할 낱말이 낭독에서 사라지면 안 된다** — sr-only 문장만 두고 보이는 글자를 `aria-hidden`으로
   * 덮으면 "Role for Jane — only owners can change this"만 읽히고 **그 역할이 무엇인지는 안 읽힌다.**
   */
  it("역할 낱말과 잠김 사유를 함께 낭독한다", async () => {
    const { container } = await render(<RoleChip role="EDITOR" who="Jane" />);
    const chip = find<HTMLElement>(container, "[data-role-chip]");
    expect(chip.textContent).toContain(m.projects.role.EDITOR);
    expect(chip.textContent).toContain(m.members.roleLocked("Jane"));
    expect(find<HTMLElement>(chip, ".sr-only").textContent).toContain(m.members.roleLocked("Jane"));
  });

  it("대상을 든다 — 행마다 같은 문구면 누구의 역할인지 구별되지 않는다", async () => {
    const { container } = await render(<RoleChip role="OWNER" who="Ann" />);
    expect(find(container, "[data-role-chip]").textContent).toContain("Ann");
  });

  /** ⚠️ **누를 수 없는 것이 눌릴 것처럼 보이면 안 된다** — 칩은 버튼이 아니다. */
  it("버튼이 아니다", async () => {
    const { container } = await render(<RoleChip role="OWNER" who="Ann" />);
    expect(container.querySelector("button")).toBeNull();
  });
});
