import { describe, expect, it } from "vitest";

import { planOwnerBackfill } from "../backfill";

/**
 * 기존 `Project`에 OWNER를 채우는 일회성 판정 (design §5 배포 순서 2).
 *
 * **멱등성을 여기서 결정한다** — 스크립트를 두 번 돌려 행 수를 세는 수동 확인 대신
 * `pnpm test`가 판정한다. 스크립트는 이 결과를 upsert하는 I/O 껍데기다.
 *
 * ⚠️ 이 판정이 비면 그다음 배포에서 **아무도 아무 프로젝트에도 못 들어간다**(fail-closed라
 * 옳지만 복구가 SQL이다).
 */

describe("planOwnerBackfill — OWNER가 없는 프로젝트만", () => {
  it("멤버가 하나도 없는 프로젝트에 OWNER 행을 낸다", () => {
    expect(
      planOwnerBackfill({ projects: [{ id: "p1" }], members: [], ownerUserId: "u-owner" }),
    ).toEqual([{ projectId: "p1", userId: "u-owner", role: "OWNER" }]);
  });

  it("이미 OWNER가 있는 프로젝트는 건너뛴다 — 소유자를 갈아치우지 않는다", () => {
    expect(
      planOwnerBackfill({
        projects: [{ id: "p1" }],
        members: [{ projectId: "p1", role: "OWNER" }],
        ownerUserId: "u-owner",
      }),
    ).toEqual([]);
  });

  it("EDITOR만 있는 프로젝트에는 OWNER 행을 낸다 — OWNER 없는 프로젝트는 접근 불가다", () => {
    expect(
      planOwnerBackfill({
        projects: [{ id: "p1" }],
        members: [{ projectId: "p1", role: "EDITOR" }],
        ownerUserId: "u-owner",
      }),
    ).toEqual([{ projectId: "p1", userId: "u-owner", role: "OWNER" }]);
  });

  it("다른 프로젝트의 OWNER는 이 프로젝트를 채워주지 않는다", () => {
    expect(
      planOwnerBackfill({
        projects: [{ id: "p1" }, { id: "p2" }],
        members: [{ projectId: "p2", role: "OWNER" }],
        ownerUserId: "u-owner",
      }),
    ).toEqual([{ projectId: "p1", userId: "u-owner", role: "OWNER" }]);
  });

  it("프로젝트가 없으면 빈 목록이다", () => {
    expect(planOwnerBackfill({ projects: [], members: [], ownerUserId: "u-owner" })).toEqual([]);
  });

  it("입력 순서를 따른다 — 같은 입력이 같은 순서를 낸다", () => {
    const input = {
      projects: [{ id: "b" }, { id: "a" }, { id: "c" }],
      members: [],
      ownerUserId: "u-owner",
    };
    expect(planOwnerBackfill(input).map((r) => r.projectId)).toEqual(["b", "a", "c"]);
    expect(planOwnerBackfill(input)).toEqual(planOwnerBackfill(input));
  });
});

describe("planOwnerBackfill — 소유자 id가 비면 던진다 (fail-closed)", () => {
  // ⚠️ 빈 목록을 내면 스크립트가 그것을 "채울 프로젝트가 없다"로 읽고 **성공을 보고한다** —
  // POSTMORTEM 2026-09-03이 정확히 그 형태였다(실패한 조회를 "없음"으로 읽었다). 그리고 스크립트는
  // `User`까지 upsert하므로 빈 id가 통과하면 **빈 id의 User가 모든 프로젝트의 OWNER가 된다.**
  // `syncBranchFor`(lib/pull/trigger.ts)가 같은 이유로 값 대신 던진다.
  it("빈 문자열이면 던진다", () => {
    expect(() =>
      planOwnerBackfill({ projects: [{ id: "p1" }], members: [], ownerUserId: "" }),
    ).toThrow();
  });

  it("공백만이어도 던진다", () => {
    expect(() =>
      planOwnerBackfill({ projects: [{ id: "p1" }], members: [], ownerUserId: "   " }),
    ).toThrow();
  });

  it("채울 프로젝트가 없어도 던진다 — 빈 결과와 잘못된 입력을 구별한다", () => {
    expect(() => planOwnerBackfill({ projects: [], members: [], ownerUserId: "" })).toThrow();
  });
});

describe("planOwnerBackfill — 멱등", () => {
  it("결과를 멤버 목록에 합쳐 다시 돌리면 0건이다", () => {
    const projects = [{ id: "p1" }, { id: "p2" }];
    const first = planOwnerBackfill({ projects, members: [], ownerUserId: "u-owner" });
    expect(first).toHaveLength(2);

    const applied = first.map((r) => ({ projectId: r.projectId, role: r.role }));
    expect(planOwnerBackfill({ projects, members: applied, ownerUserId: "u-owner" })).toEqual([]);
  });
});
