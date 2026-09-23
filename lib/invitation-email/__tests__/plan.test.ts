import { describe, expect, it } from "vitest";

import { MEMBER_LIMIT } from "@/lib/auth/invitation";

import {
  ADDRESS_INTERVAL_MS,
  INVITATION_HOURLY_LIMIT,
  PROJECT_WINDOW_MS,
  planInvitationIssue,
  type IssueTarget,
} from "../plan";

/**
 * 발급 판정 (design §3). **요청 전체가 통과하거나 전체가 막힌다** — 배열 순서로 일부를 보내지 않는다.
 *
 * 입력은 `Project` 잠금 안에서 읽은 값이다: 현재 멤버 수, 대상별 이미 멤버 여부와 마지막 발급 시각,
 * 프로젝트의 최근 발급 시각들. 발급 기록은 수락·철회·만료된 것도 포함한다(호출부의 조회 책임).
 */

const NOW = new Date("2026-09-23T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const target = (over: Partial<IssueTarget> = {}): IssueTarget => ({ alreadyMember: false, lastIssuedAt: null, ...over });

function plan(over: Partial<Parameters<typeof planInvitationIssue>[0]> = {}) {
  return planInvitationIssue({ now: NOW, memberCount: 1, targets: [target()], recentIssues: [], ...over });
}

describe("planInvitationIssue — 정상", () => {
  it("기록이 없으면 통과한다", () => {
    expect(plan({ targets: [target(), target(), target()] })).toEqual({ status: "ok" });
  });

  it("상수는 스펙 값이다", () => {
    expect(ADDRESS_INTERVAL_MS).toBe(60_000);
    expect(PROJECT_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(INVITATION_HOURLY_LIMIT).toBe(20);
  });
});

describe("planInvitationIssue — 좌석은 발급 시점의 현재 멤버 수다", () => {
  it("멤버가 상한이면 member-limit이다", () => {
    expect(plan({ memberCount: MEMBER_LIMIT })).toEqual({ status: "member-limit", limit: MEMBER_LIMIT });
  });

  it("9명일 때 3명 초대는 통과한다 — 입력 인원을 좌석 예약으로 세지 않는다", () => {
    expect(plan({ memberCount: MEMBER_LIMIT - 1, targets: [target(), target(), target()] })).toEqual({ status: "ok" });
  });
});

describe("planInvitationIssue — 한 명이라도 거부면 전체 차단", () => {
  it("이미 멤버인 대상은 그 인덱스의 행 오류다", () => {
    expect(plan({ targets: [target(), target({ alreadyMember: true }), target()] })).toEqual({
      status: "invalid-rows",
      rowErrors: [{ index: 1, code: "already-member" }],
    });
  });

  it("여러 명이 이미 멤버면 전부 모은다", () => {
    expect(plan({ targets: [target({ alreadyMember: true }), target(), target({ alreadyMember: true })] })).toEqual({
      status: "invalid-rows",
      rowErrors: [
        { index: 0, code: "already-member" },
        { index: 2, code: "already-member" },
      ],
    });
  });

  it("좌석 부족이 행 오류보다 먼저다 — 행을 고쳐도 풀리지 않는다", () => {
    expect(plan({ memberCount: MEMBER_LIMIT, targets: [target({ alreadyMember: true })] }).status).toBe("member-limit");
  });

  it("행 오류가 간격 제한보다 먼저다 — 기다려도 풀리지 않는다", () => {
    expect(
      plan({ targets: [target({ alreadyMember: true }), target({ lastIssuedAt: ago(1_000) })] }).status,
    ).toBe("invalid-rows");
  });
});

describe("planInvitationIssue — 같은 주소 60초 간격", () => {
  it("한 대상이 59.999초 전에 발급됐으면 요청 전체가 막히고 그 대상의 60초 뒤가 retryAt이다", () => {
    const last = ago(ADDRESS_INTERVAL_MS - 1);
    expect(plan({ targets: [target(), target({ lastIssuedAt: last })] })).toEqual({
      status: "rate-limited",
      retryAt: new Date(last.getTime() + ADDRESS_INTERVAL_MS),
    });
  });

  it("정확히 60초 전이면 통과한다 — 정각은 열린 쪽이다", () => {
    expect(plan({ targets: [target({ lastIssuedAt: ago(ADDRESS_INTERVAL_MS) })] })).toEqual({ status: "ok" });
  });

  it("여러 대상이 막히면 가장 늦게 풀리는 시각이다", () => {
    const early = ago(50_000);
    const late = ago(10_000);
    expect(plan({ targets: [target({ lastIssuedAt: early }), target({ lastIssuedAt: late })] })).toEqual({
      status: "rate-limited",
      retryAt: new Date(late.getTime() + ADDRESS_INTERVAL_MS),
    });
  });
});

describe("planInvitationIssue — 프로젝트 최근 1시간 20건", () => {
  const issues = (n: number, spacingMs = 60_000) =>
    Array.from({ length: n }, (_, i) => ago(PROJECT_WINDOW_MS - 1 - i * spacingMs));

  it("19건 상태의 1명은 20번째라 통과한다", () => {
    expect(plan({ recentIssues: issues(19) })).toEqual({ status: "ok" });
  });

  it("20건 상태의 1명은 21번째라 막힌다", () => {
    const recent = issues(20);
    expect(plan({ recentIssues: recent })).toEqual({
      status: "rate-limited",
      retryAt: new Date((recent[0] as Date).getTime() + PROJECT_WINDOW_MS),
    });
  });

  it("19건 상태의 3명 요청은 전체가 거부된다 — 앞의 1명만 보내지 않는다", () => {
    const recent = issues(19);
    // 3건을 받으려면 가장 오래된 2건이 창을 벗어나야 한다 — 두 번째로 오래된 기록의 1시간 뒤다.
    expect(plan({ recentIssues: recent, targets: [target(), target(), target()] })).toEqual({
      status: "rate-limited",
      retryAt: new Date((recent[1] as Date).getTime() + PROJECT_WINDOW_MS),
    });
  });

  it("정확히 1시간 전 기록은 창 밖이다 — 정각은 열린 쪽이다", () => {
    const recent = [ago(PROJECT_WINDOW_MS), ...issues(19)];
    expect(plan({ recentIssues: recent })).toEqual({ status: "ok" });
  });

  it("입력 순서와 무관하다 — 호출부가 정렬하지 않아도 가장 오래된 기록부터 센다", () => {
    const recent = issues(20);
    const shuffled = [...recent].reverse();
    expect(plan({ recentIssues: shuffled })).toEqual({
      status: "rate-limited",
      retryAt: new Date((recent[0] as Date).getTime() + PROJECT_WINDOW_MS),
    });
  });

  it("미래 시각 기록(시계 차)도 창 안으로 센다 — 우회를 만들지 않는다", () => {
    const recent = [...issues(19), new Date(NOW.getTime() + 5_000)];
    expect(plan({ recentIssues: recent }).status).toBe("rate-limited");
  });

  it("간격과 시간창이 둘 다 막으면 더 늦은 시각이다", () => {
    const recent = issues(20);
    const last = ago(1_000);
    const windowRetry = (recent[0] as Date).getTime() + PROJECT_WINDOW_MS;
    const addressRetry = last.getTime() + ADDRESS_INTERVAL_MS;
    expect(plan({ recentIssues: recent, targets: [target({ lastIssuedAt: last })] })).toEqual({
      status: "rate-limited",
      retryAt: new Date(Math.max(windowRetry, addressRetry)),
    });
  });

  it("한 요청이 시간당 상한 자체를 넘으면 too-many다 — 기다려도 풀리지 않는다", () => {
    const targets = Array.from({ length: INVITATION_HOURLY_LIMIT + 1 }, () => target());
    expect(plan({ targets })).toEqual({ status: "too-many", limit: INVITATION_HOURLY_LIMIT });
  });
});
