import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pendingInvitationWhere } from "../pending-invitation";

/**
 * 대기 초대의 술어 (project-card-tabs T6) — **수락·만료 둘 다 뺀다.** 수락된 행을 지우지 않는 설계라 한쪽만 보면 이미 멤버가 된 사람의
 * 초대가 "대기 중"으로 센다. 멤버 화면 목록과 Home `Members (N)`이 같은 행을 세도록 한 자리에 둔다.
 */
describe("pendingInvitationWhere", () => {
  it("수락되지 않았고 지금보다 늦게 만료되는 초대만", () => {
    const now = new Date("2026-10-04T00:00:00Z");
    expect(pendingInvitationWhere(now)).toEqual({ acceptedAt: null, expiresAt: { gt: now } });
  });

  /** 사본이 다시 생기지 않게 — 두 소비자가 손으로 쓴 술어가 아니라 이 헬퍼를 부른다. */
  it.each(["lib/auth/query.ts", "app/(edit)/projects/[slug]/(home)/page.tsx"])("%s가 헬퍼를 부르고 술어를 손으로 쓰지 않는다", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("pendingInvitationWhere(now)");
    expect(source).not.toMatch(/acceptedAt: null, expiresAt: \{ gt/);
  });
});
