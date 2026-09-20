import { describe, expect, it } from "vitest";

import { MEMBER_LIMIT } from "@/lib/auth/invitation";
import { planSeatNotice } from "@/lib/auth/seat-notice";

/**
 * **패널 헤더 우측이 무엇을 말하는가** (members-rework design §1).
 *
 * 이 함수가 존재하는 이유는 **"EDITOR × 좌석 10/10에 문구가 둘"** 이라는 질문이다 — 판정 함수가 없으면
 * 그 우선순위가 JSX 조건문에 묻힌다. 아래 `ownerOnly` 단언이 그것을 닫는다.
 */
describe("planSeatNotice — OWNER", () => {
  it("자리가 남으면 잔량을 말하고 초대를 연다", () => {
    expect(planSeatNotice({ role: "OWNER", memberCount: 4 })).toEqual({
      kind: "seats",
      n: 4,
      limit: MEMBER_LIMIT,
      canInvite: true,
    });
  });

  /**
   * ⚠️ **상한을 화면이 따로 들지 않는다** — 그 수는 `planInvitationCreate`가 돌려주는 값이고,
   * 서버 거부가 쓰는 것과 **같은 함수**에서 나온다.
   */
  it("좌석이 차면 초대를 닫고 상한을 값으로 준다", () => {
    expect(planSeatNotice({ role: "OWNER", memberCount: MEMBER_LIMIT })).toEqual({
      kind: "seatsFull",
      n: MEMBER_LIMIT,
      limit: MEMBER_LIMIT,
      canInvite: false,
    });
  });

  /** 이미 넘긴 상태도 같은 갈래다 — 경계만 보면 넘어간 프로젝트가 계속 초대한다. */
  it("이미 넘겨 있어도 닫힌다", () => {
    expect(planSeatNotice({ role: "OWNER", memberCount: MEMBER_LIMIT + 3 })).toMatchObject({
      kind: "seatsFull",
      canInvite: false,
    });
  });

  it("경계가 서버 거부와 같은 자리다 — 9는 열리고 10은 닫힌다", () => {
    expect(planSeatNotice({ role: "OWNER", memberCount: MEMBER_LIMIT - 1 }).canInvite).toBe(true);
    expect(planSeatNotice({ role: "OWNER", memberCount: MEMBER_LIMIT }).canInvite).toBe(false);
  });
});

describe("planSeatNotice — EDITOR", () => {
  it("역할 사유가 선다", () => {
    expect(planSeatNotice({ role: "EDITOR", memberCount: 4 })).toEqual({ kind: "ownerOnly", canInvite: false });
  });

  /**
   * ⚠️ **이 단언이 열린 결정 하나를 닫는 자리다** (spec §10). EDITOR가 좌석 10/10을 보면 문구 후보가
   * 둘인데, **역할 사유가 이긴다** — 좌석을 비워도 EDITOR는 여전히 초대할 수 없으므로 좌석 문구는
   * 그 사람이 할 수 있는 일을 말하지 않는다.
   */
  it("좌석이 차 있어도 역할 사유가 이긴다 — 좌석 문구를 보여주면 거짓 희망이다", () => {
    expect(planSeatNotice({ role: "EDITOR", memberCount: MEMBER_LIMIT })).toEqual({
      kind: "ownerOnly",
      canInvite: false,
    });
  });

  it("좌석 수와 무관하게 한 갈래다", () => {
    const kinds = new Set(
      [0, 1, MEMBER_LIMIT - 1, MEMBER_LIMIT, MEMBER_LIMIT + 5].map(
        (memberCount) => planSeatNotice({ role: "EDITOR", memberCount }).kind,
      ),
    );
    expect([...kinds]).toEqual(["ownerOnly"]);
  });
});
