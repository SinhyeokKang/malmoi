import { describe, expect, it } from "vitest";

import { planMemberChange, type MemberRow } from "../membership";

/**
 * 마지막 OWNER 보호 (SAAS.md §5.6 — "Project에는 항상 OWNER가 한 명 이상").
 *
 * ⚠️ **제거와 강등이 같은 판정을 지난다.** 강등을 별도 경로로 두면 "제거는 막고 강등은 통과"가
 * 되고, 결과는 같다 — OWNER 없는 프로젝트다. `nextRole: null`이 제거다.
 */

const OWNER_A: MemberRow = { userId: "u-owner-a", role: "OWNER" };
const OWNER_B: MemberRow = { userId: "u-owner-b", role: "OWNER" };
const EDITOR: MemberRow = { userId: "u-editor", role: "EDITOR" };

describe("planMemberChange — 제거", () => {
  it("OWNER가 둘이면 하나를 제거할 수 있다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, OWNER_B], targetUserId: OWNER_A.userId, nextRole: null }),
    ).toBe("ok");
  });

  it("마지막 OWNER는 제거할 수 없다 — 자기 제거·탈퇴가 같은 경로다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, EDITOR], targetUserId: OWNER_A.userId, nextRole: null }),
    ).toBe("last-owner");
  });

  it("EDITOR는 제거할 수 있다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, EDITOR], targetUserId: EDITOR.userId, nextRole: null }),
    ).toBe("ok");
  });
});

describe("planMemberChange — 역할 변경", () => {
  it("마지막 OWNER를 EDITOR로 강등할 수 없다 — 제거와 같은 판정이다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, EDITOR], targetUserId: OWNER_A.userId, nextRole: "EDITOR" }),
    ).toBe("last-owner");
  });

  it("OWNER가 둘이면 하나를 강등할 수 있다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, OWNER_B], targetUserId: OWNER_A.userId, nextRole: "EDITOR" }),
    ).toBe("ok");
  });

  it("EDITOR를 OWNER로 올릴 수 있다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, EDITOR], targetUserId: EDITOR.userId, nextRole: "OWNER" }),
    ).toBe("ok");
  });

  it("유일한 OWNER를 OWNER로 두는 것은 통과한다 — 소유권이 줄지 않는다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, EDITOR], targetUserId: OWNER_A.userId, nextRole: "OWNER" }),
    ).toBe("ok");
  });
});

describe("planMemberChange — 대상이 멤버가 아닐 때", () => {
  it("멤버 목록에 없으면 not-member다 — '성공'으로 접지 않는다", () => {
    expect(
      planMemberChange({ members: [OWNER_A, EDITOR], targetUserId: "u-stranger", nextRole: null }),
    ).toBe("not-member");
  });

  it("목록이 비어 있으면 not-member다", () => {
    expect(planMemberChange({ members: [], targetUserId: OWNER_A.userId, nextRole: null })).toBe(
      "not-member",
    );
  });

  it("멤버가 아닌 대상은 역할 변경도 not-member다", () => {
    expect(
      planMemberChange({ members: [OWNER_A], targetUserId: "u-stranger", nextRole: "OWNER" }),
    ).toBe("not-member");
  });
});
