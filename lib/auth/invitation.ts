import { createHash } from "node:crypto";

import { normalizeEmail } from "./email";

/**
 * 초대 토큰과 수락 판정 (ARCHITECTURE §6.02).
 *
 * **원문을 DB에 저장하지 않는다** — 발급 시 한 번만 보여주고 해시만 남긴다. `Project.pushTokenHash`
 * (PRODUCT §7.8)가 같은 모델이라 해시 저장 규칙이 한 곳에 모인다.
 */

/** 판정에 필요한 것만 받는다 — projectId·role은 호출부가 이미 들고 있는 행에서 읽는다. */
export type InvitationRow = {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
};

export type InvitationAccept =
  | "ok"
  | "expired"
  | "already-accepted"
  | "email-mismatch"
  | "not-found";

/**
 * ⚠️ **`timingSafeEqual`이 없는 것이 누락이 아니다.** `checkBearer`(`lib/push/auth.ts`)는 평문
 * 토큰을 직접 비교하므로 타이밍이 정보를 준다. 여기는 비교 자체를 하지 않는다 — 수락은
 * **해시로 행을 조회**하고(`tokenHash @unique`), 조회 시간이 새어도 sha256 원문을 역산할 수 없다.
 */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * ⚠️ **`not-found`가 별도 값이다.** 조회 실패("그런 초대가 없다")를 "권한 없음"으로 접으면
 * 실패한 조회가 정상 거부로 읽힌다 — POSTMORTEM 2026-09-03이 정확히 그 형태였다(실패한 PR
 * 조회를 "PR 없음"으로 읽어 경고가 사라졌다). 화면이 넷을 각자 다른 문구로 보인다 (design §4.1).
 *
 * **판정 순서가 의미를 갖는다:**
 * 1. 수락됨이 만료보다 앞이다 — "이미 쓴 링크"가 "만료됐다"보다 정확한 안내다.
 * 2. 만료가 이메일 대조보다 앞이다 — 그래야 **만료된 토큰이 초대받은 이메일을 노출하지 않는다.**
 *
 * @param verifiedEmail **provider가 검증한** 이메일만 넘어온다 (`signIn` 콜백이 미검증을 거부한다).
 */
export function planInvitationAccept(input: {
  invitation: InvitationRow | null;
  verifiedEmail: string;
  now: Date;
}): InvitationAccept {
  const { invitation, verifiedEmail, now } = input;

  if (invitation === null) return "not-found";
  if (invitation.acceptedAt !== null) return "already-accepted";
  // 만료 시각 정각은 이미 만료다 — 유효 구간을 만료 이전까지로 닫는다.
  if (now.getTime() >= invitation.expiresAt.getTime()) return "expired";

  const verified = normalizeEmail(verifiedEmail);
  // 빈 이메일을 일치로 읽지 않는다. 초대 쪽도 비어 있으면 둘 다 ""가 되어 통과하는 구멍이 생긴다 —
  // 부재를 통과로 읽으면 이메일 소유권 증명이 사라진다 (ARCHITECTURE §6의 fail-closed).
  if (verified === "") return "email-mismatch";

  return verified === normalizeEmail(invitation.email) ? "ok" : "email-mismatch";
}

/**
 * 프로젝트당 멤버 상한 (ARCHITECTURE §5.6).
 *
 * `PROJECT_LIMIT`(`lib/onboarding/create-plan.ts`)과 같은 형이다 — **상수는 소비자 옆**에 두고
 * 모음 파일을 만들지 않는다. 자율 가입의 대가로 건 고정 제한이 이로써 둘이다.
 */
export const MEMBER_LIMIT = 10;

export type InvitationCreate = { status: "ok" } | { status: "member-limit"; limit: number };

/**
 * 초대를 하나 더 발급해도 되는가.
 *
 * ⚠️ **대기 초대는 안 센다.** 가장 단순한 규칙이고, 그 대가는 "10명 직전에 초대 여럿을 뿌리면
 * 상한을 넘긴 채 수락된다"는 것이다. 대기까지 세면 **만료된 초대 때문에 못 부르는** 상태가 생기고
 * 그것을 설명할 화면이 없다.
 *
 * @param memberCount `createInvitation`이 **이미 잠근 `Project` 행**의 트랜잭션 안에서 센 값이다 —
 *   밖에서 세면 두 탭의 동시 초대가 자리를 하나 더 만든다 (`planProjectCreate`의 재집계와 같은 형).
 * @returns `limit`을 값으로 돌려준다 — 문구가 상수를 따로 들면 둘이 갈린다.
 */
export function planInvitationCreate(input: { memberCount: number }): InvitationCreate {
  return input.memberCount >= MEMBER_LIMIT ? { status: "member-limit", limit: MEMBER_LIMIT } : { status: "ok" };
}
