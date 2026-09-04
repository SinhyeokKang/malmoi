import { createHash } from "node:crypto";

import { normalizeEmail } from "./email";

/**
 * 초대 토큰과 수락 판정 (SAAS.md §5.6).
 *
 * **원문을 DB에 저장하지 않는다** — 발급 시 한 번만 보여주고 해시만 남긴다. `Project.pushTokenHash`
 * (SAAS §7.8)가 같은 모델이라 해시 저장 규칙이 한 곳에 모인다.
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
  // `isLoginAllowed`가 빈 핸들을 이중으로 막는 것과 같은 이유다 (ARCHITECTURE §6).
  if (verified === "") return "email-mismatch";

  return verified === normalizeEmail(invitation.email) ? "ok" : "email-mismatch";
}
