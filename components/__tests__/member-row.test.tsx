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
   * ⚠️ **씨앗이 없으면 `?`다 — 1행의 첫 글자가 아니다** (캔버스 `1a` 넷째 행). 마스킹 주소의 첫
   * 글자(`j`)를 쓰면 셸 아바타와 다른 글자·다른 색이 되어 **아바타가 사람을 못 가리킨다**
   * (`entity-card.tsx`가 밟은 함정). 갈래를 늘리지 않고 빈 이름을 넘기면 프리미티브가 그 답을 낸다.
   */
  it("씨앗이 없으면 `?`이고 1행의 첫 글자를 쓰지 않는다", async () => {
    for (const row of [identity(null, "j***@acme.com"), identity(null, null), identity("Jane", "j***@x.com", false)]) {
      const { container } = await render(<MemberRow id="u1" identity={row} />);
      expect(find(container, "[data-avatar]").textContent).toBe("?");
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
   * ⚠️ **한 행에 띠는 항상 하나다** — 띠가 둘이면 `aria-describedby`가 어느 쪽을 가리킬지 정해야 하고,
   * 그 판정이 화면마다 갈린다.
   */
  it("문장이 둘이어도 띠는 하나다", async () => {
    const { container } = await render(
      <MemberRow id="u1" identity={identity("A", null, false)} band={<>{m.members.unreadableHint} {m.errors.access["last-owner"]}</>} />,
    );
    expect(container.querySelectorAll(BAND)).toHaveLength(1);
    expect(find(container, BAND).textContent).toContain(m.members.unreadableHint);
    expect(find(container, BAND).textContent).toContain(m.errors.access["last-owner"]);
  });

  /**
   * ⚠️ **띠에 붉은 톤이 없다** (2026-09-20 사용자 — *"alert 계열 말고 그냥 일반 계열"*). 마지막 오너는
   * 오너가 하나이면 **언제나 참인 상태**라, 그 문장이 붉으면 경고가 배경이 되고 진짜 거부(사후
   * `Alert`)와 구별되지 않는다. 톤 슬롯 자체를 지웠으므로 호출부가 되살릴 자리도 없다.
   */
  it("띠가 언제나 muted다 — 사유가 붉지 않다", async () => {
    const { container } = await render(
      <MemberRow id="u1" identity={identity("A", null)} band={m.errors.access["last-owner"]} />,
    );
    const band = find<HTMLElement>(container, BAND);
    expect(band.className).toContain("text-muted-foreground");
    expect(band.className).not.toContain("text-destructive");
  });
});

describe("RoleChip", () => {
  /**
   * ⚠️ **역할 낱말이 낭독에서 사라지면 안 된다.** `aria-label`이 보이는 글자를 **덮어쓰므로**, 그 라벨이
   * 역할을 포함하지 않으면 "only owners can change roles"만 읽히고 무엇이 잠겼는지는 안 읽힌다.
   * 캔버스가 라벨을 `{role}, …`로 시작시키는 이유이고, WCAG 2.5.3(Label in Name)도 그것으로 지켜진다.
   */
  it("보이는 역할 낱말이 낭독되는 문장 안에 들어 있다", async () => {
    const { container } = await render(<RoleChip role="EDITOR" reason="editor" />);
    const chip = find<HTMLElement>(container, "[data-role-chip]");
    expect(chip.textContent).toContain(m.projects.role.EDITOR);
    expect(find<HTMLElement>(chip, ".sr-only").textContent).toBe(
      m.members.roleLocked.editor(m.projects.role.EDITOR),
    );
  });

  /**
   * ⚠️ **`aria-label`을 쓰면 ARIA 규격 위반이다** (리뷰 🔴1). role 없는 `<span>`은 `generic`이고
   * naming이 금지돼 있다 — Chromium은 그 노드를 unignore해 이름을 실어 주므로 **CDP 실측이 통과
   * 신호를 준다.** 그것은 Chrome이 관대하다는 사실이지 계약이 아니다.
   */
  it("칩이 `aria-label`을 쓰지 않는다 — role 없는 span에는 이름을 못 붙인다", async () => {
    const { container } = await render(<RoleChip role="EDITOR" reason="editor" />);
    const chip = find<HTMLElement>(container, "[data-role-chip]");
    expect(chip.getAttribute("aria-label")).toBeNull();
    expect(chip.getAttribute("role")).toBeNull();
  });

  /**
   * ⚠️ **잠긴 까닭이 둘이라 문장이 둘이다** (핸드오프 결정 3). 한 문장으로 접으면 대기 초대의
   * **복구 경로**("Revoke하고 다시 초대")가 사라진다 — 그 행에서 할 수 있는 유일한 일이다.
   */
  it("대기 초대와 EDITOR 시야가 다른 사유를 낭독한다", async () => {
    const pending = await render(<RoleChip role="OWNER" reason="pending" />);
    const editor = await render(<RoleChip role="OWNER" reason="editor" />);
    const label = (c: HTMLElement) => find<HTMLElement>(c, "[data-role-chip] .sr-only").textContent;
    expect(label(pending.container)).toContain("Revoke and invite again");
    expect(label(editor.container)).not.toContain("Revoke and invite again");
    expect(label(pending.container)).not.toBe(label(editor.container));
  });

  /** ⚠️ **자물쇠는 `aria-hidden`이다** — 칩이 라벨을 들므로 글리프가 이름에 끼면 안 된다. */
  it("자물쇠가 접근성 트리 밖이다", async () => {
    const { container } = await render(<RoleChip role="OWNER" reason="pending" />);
    expect(find(container, "[data-role-chip] svg").getAttribute("aria-hidden")).toBe("true");
  });

  /** ⚠️ **누를 수 없는 것이 눌릴 것처럼 보이면 안 된다** — 칩은 버튼이 아니다. */
  it("버튼이 아니다", async () => {
    const { container } = await render(<RoleChip role="OWNER" reason="pending" />);
    expect(container.querySelector("button")).toBeNull();
  });
});
