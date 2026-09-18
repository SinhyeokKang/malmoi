import { describe, expect, it } from "vitest";

import {
  MEMBER_LIMIT,
  hashInviteToken,
  planInvitationAccept,
  planInvitationCreate,
  type InvitationRow,
} from "../invitation";

/**
 * 초대 토큰과 수락 판정 (ARCHITECTURE §6.02).
 *
 * ⚠️ **`not-found`가 별도 값인 이유**: 조회 실패와 "권한 없음"을 같은 값으로 접으면
 * **실패한 조회가 정상 거부로 읽힌다** — POSTMORTEM 2026-09-03이 정확히 그 형태였다
 * (실패한 PR 조회를 "PR 없음"으로 읽어 경고가 사라졌다). 호출부가 넷을 구별해 각자 다른
 * 문구를 보인다 (ARCHITECTURE §6.3).
 */

const T = new Date("2026-09-05T00:00:00.000Z");
const BEFORE = new Date(T.getTime() - 1);
const AFTER = new Date(T.getTime() + 1);

function invitation(over: Partial<InvitationRow> = {}): InvitationRow {
  return { email: "editor@example.com", expiresAt: T, acceptedAt: null, ...over };
}

describe("hashInviteToken — 원문을 저장하지 않는다", () => {
  it("sha256 hex다 — 실측 골든값과 일치한다", () => {
    expect(hashInviteToken("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(hashInviteToken("inv_token_abc")).toBe(
      "66fa9707fabebbd0950ba1574db3130f9e397f52434bdb09c4a7380f615fa189",
    );
    expect(hashInviteToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("같은 입력은 같은 해시다 — 링크로 행을 찾을 수 있어야 한다", () => {
    expect(hashInviteToken("tok_1")).toBe(hashInviteToken("tok_1"));
  });

  it("다른 입력은 다른 해시다", () => {
    expect(hashInviteToken("tok_1")).not.toBe(hashInviteToken("tok_2"));
  });

  it("출력에 원문이 남지 않는다 — DB에 해시만 들어간다", () => {
    const raw = "inv_token_abc";
    expect(hashInviteToken(raw)).not.toContain(raw);
    expect(hashInviteToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("planInvitationAccept — 다섯 분기", () => {
  it("행이 없으면 not-found다 — '거부'와 접지 않는다 (POSTMORTEM 2026-09-03)", () => {
    expect(
      planInvitationAccept({ invitation: null, verifiedEmail: "editor@example.com", now: BEFORE }),
    ).toBe("not-found");
  });

  it("만료 전이고 이메일이 맞으면 ok다", () => {
    expect(
      planInvitationAccept({ invitation: invitation(), verifiedEmail: "editor@example.com", now: BEFORE }),
    ).toBe("ok");
  });

  it("만료 1ms 뒤는 expired다", () => {
    expect(
      planInvitationAccept({ invitation: invitation(), verifiedEmail: "editor@example.com", now: AFTER }),
    ).toBe("expired");
  });

  it("만료 시각 정각도 expired다 — 유효 구간은 만료 이전까지다", () => {
    expect(
      planInvitationAccept({ invitation: invitation(), verifiedEmail: "editor@example.com", now: T }),
    ).toBe("expired");
  });

  it("이미 수락된 행은 already-accepted다 — 단일 사용", () => {
    expect(
      planInvitationAccept({
        invitation: invitation({ acceptedAt: BEFORE }),
        verifiedEmail: "editor@example.com",
        now: BEFORE,
      }),
    ).toBe("already-accepted");
  });

  it("수락됐고 만료도 됐으면 already-accepted가 이긴다 — '이미 쓴 링크'가 더 정확한 안내다", () => {
    expect(
      planInvitationAccept({
        invitation: invitation({ acceptedAt: BEFORE }),
        verifiedEmail: "editor@example.com",
        now: AFTER,
      }),
    ).toBe("already-accepted");
  });

  it("이메일이 다르면 email-mismatch다", () => {
    expect(
      planInvitationAccept({ invitation: invitation(), verifiedEmail: "other@example.com", now: BEFORE }),
    ).toBe("email-mismatch");
  });

  it("대소문자·공백 차이는 **일치**로 본다 — normalizeEmail을 지난다", () => {
    expect(
      planInvitationAccept({
        invitation: invitation({ email: "Editor@Example.COM" }),
        verifiedEmail: " editor@example.com ",
        now: BEFORE,
      }),
    ).toBe("ok");
  });

  it("만료가 이메일 불일치보다 먼저 판정된다 — 만료된 토큰이 초대받은 이메일을 노출하지 않는다", () => {
    expect(
      planInvitationAccept({ invitation: invitation(), verifiedEmail: "other@example.com", now: AFTER }),
    ).toBe("expired");
  });

  it("검증된 이메일이 비어 있으면 수락되지 않는다 — fail-closed", () => {
    expect(
      planInvitationAccept({ invitation: invitation({ email: "" }), verifiedEmail: "", now: BEFORE }),
    ).toBe("email-mismatch");
  });
});

/**
 * **프로젝트당 멤버 제한** (PRODUCT §4.2).
 *
 * 상한이 `PROJECT_LIMIT`(`lib/onboarding/create-plan.ts`)과 같은 형이다 — 상수는 **소비자 옆**에
 * 두고 모음 파일을 만들지 않는다. `createInvitation`이 이미 `Project` 행을 잠그므로 그 트랜잭션
 * 안에서 센 값을 넘긴다.
 */
describe("planInvitationCreate — 멤버 10명 제한", () => {
  it("9명이면 통과다 — 열째 자리가 남아 있다", () => {
    expect(planInvitationCreate({ memberCount: MEMBER_LIMIT - 1 })).toEqual({ status: "ok" });
  });

  it("10명이면 거부하고 상한을 값으로 준다 — 문구가 숫자를 따로 들면 둘이 갈린다", () => {
    expect(planInvitationCreate({ memberCount: MEMBER_LIMIT })).toEqual({
      status: "member-limit",
      limit: MEMBER_LIMIT,
    });
  });

  it("이미 넘겨 있어도 거부다 — 경계만 보면 넘어간 프로젝트가 계속 초대한다", () => {
    expect(planInvitationCreate({ memberCount: MEMBER_LIMIT + 5 })).toMatchObject({
      status: "member-limit",
    });
  });

  it("⚠️ 대기 초대는 안 센다 — 가장 단순한 규칙이고 그 대가는 초과 수락이다", () => {
    // 대기 초대까지 세면 "만료된 초대 때문에 못 부른다"가 생기고 그것을 설명할 화면이 없다.
    expect(planInvitationCreate({ memberCount: 0 })).toEqual({ status: "ok" });
  });

  it("상한이 10이다", () => {
    expect(MEMBER_LIMIT).toBe(10);
  });
});
