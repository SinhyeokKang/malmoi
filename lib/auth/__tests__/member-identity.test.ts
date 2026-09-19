import { describe, expect, it } from "vitest";

import { planMemberIdentity } from "@/lib/auth/member-identity";
import { m } from "@/lib/i18n";

/**
 * **행의 두 줄 배치와 아바타 씨앗** (members-rework design §1).
 *
 * 멤버 행과 대기 초대 행이 같은 함수를 지난다 — 배치가 갈리면 같은 사람이 두 카드에서 다르게 보인다.
 * 대기 초대에는 `name`이 없으므로 호출부가 `name: null`을 박는다.
 */
describe("planMemberIdentity — 갈래 넷", () => {
  it("이름이 있으면 이름이 1행이고 마스킹 주소가 2행이다", () => {
    expect(planMemberIdentity({ name: "Jane", emailLabel: "j***@acme.com", readable: true })).toEqual({
      primary: "Jane",
      secondary: "j***@acme.com",
      unnamed: false,
      avatarSeed: "Jane",
    });
  });

  /**
   * ⚠️ **마스킹 주소가 1행으로 올라가면 2행은 비운다** — 같은 값을 두 줄에 쓰면 행 높이만 늘고
   * 읽을 것은 그대로다.
   */
  it("이름이 없으면 마스킹 주소가 1행으로 올라가고 2행이 빈다", () => {
    expect(planMemberIdentity({ name: null, emailLabel: "j***@acme.com", readable: true })).toEqual({
      primary: "j***@acme.com",
      secondary: null,
      unnamed: false,
      avatarSeed: null,
    });
  });

  it("이름도 주소도 없으면 자리 채움 문구가 선다", () => {
    expect(planMemberIdentity({ name: null, emailLabel: null, readable: true })).toEqual({
      primary: m.members.unnamed,
      secondary: null,
      unnamed: true,
      avatarSeed: null,
    });
  });

  /**
   * ⚠️ **못 읽은 행은 `readable`이 정한다 — 라벨 문자열을 비교하지 않는다.** `m.common.unreadable`과
   * 값을 견주는 코드는 리포에 0건이고, 넣는 순간 리포 최초의 문자열 센티널을 만드는 것이다.
   */
  it("못 읽은 행은 이름·주소가 있어 보여도 전용 문구가 선다", () => {
    expect(planMemberIdentity({ name: "Jane", emailLabel: "j***@acme.com", readable: false })).toEqual({
      primary: m.members.unreadableLabel,
      secondary: null,
      unnamed: true,
      avatarSeed: null,
    });
  });

  it("못 읽은 행은 이름·주소가 비어도 같은 결과다 — 갈래가 하나다", () => {
    expect(planMemberIdentity({ name: null, emailLabel: null, readable: false })).toEqual(
      planMemberIdentity({ name: "Jane", emailLabel: "j***@acme.com", readable: false }),
    );
  });
});

/**
 * **아바타 씨앗이 1행 텍스트와 갈라져 있다** (`components/ui/entity-card.tsx:31-35`가 이미 밟은 함정).
 *
 * 1행이 마스킹 주소면 이니셜이 `o***@…` → `o`가 되어 셸 아바타(표시 이름에서 온 `s`)와 다른 글자·
 * 다른 색이 된다 — 같은 계정이 화면마다 다른 사람처럼 보인다.
 */
describe("planMemberIdentity — 아바타 씨앗", () => {
  it("씨앗은 이름일 때만 있고, 1행이 주소로 대체된 갈래에서는 null이다", () => {
    const named = planMemberIdentity({ name: "Jane", emailLabel: "j***@acme.com", readable: true });
    const masked = planMemberIdentity({ name: null, emailLabel: "j***@acme.com", readable: true });
    expect(named.avatarSeed).toBe("Jane");
    expect(masked.avatarSeed).toBeNull();
    // 씨앗을 1행에서 주워 쓰면 이 단언이 깨진다 — 그것이 이 필드를 가른 이유다.
    expect(masked.avatarSeed).not.toBe(masked.primary);
  });

  it("자리 채움 문구가 이니셜이 되지 않는다 — `N`도 `C`도 사람을 가리키지 않는다", () => {
    for (const input of [
      { name: null, emailLabel: null, readable: true },
      { name: null, emailLabel: null, readable: false },
    ]) {
      expect(planMemberIdentity(input).avatarSeed).toBeNull();
    }
  });

  /** ⚠️ **공백만 있는 이름은 이름이 아니다** — `Avatar`가 `"?"`로 떨어뜨리고 색도 빈 문자열에서 뽑힌다. */
  it("공백뿐인 이름은 이름으로 치지 않는다", () => {
    expect(planMemberIdentity({ name: "   ", emailLabel: "j***@acme.com", readable: true })).toEqual({
      primary: "j***@acme.com",
      secondary: null,
      unnamed: false,
      avatarSeed: null,
    });
  });
});
