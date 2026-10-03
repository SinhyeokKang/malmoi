import type { Prisma } from "@/generated/prisma/client";

/**
 * 아직 쓸 수 있는 초대 — `acceptedAt IS NULL AND expiresAt > now`. **멤버 화면 목록(`loadPendingInvitations`)과 Home `Members (N)`이 같은 행을 센다.**
 *
 * ⚠️ **술어가 둘이다** — 수락된 행을 지우지 않는 설계(`prisma/schema.prisma`의 `acceptedAt` 주석)라 한쪽만 보면 이미 멤버가 된 사람의 초대가
 * "대기 중"으로 남는다. ⚠️ 수락·재발급의 CAS 갱신(`expiresAt: { equals, gt }`)은 같은 술어가 아니다 — 여기로 모으지 않는다(POSTMORTEM 2026-09-10).
 *
 * @param now 호출부가 넘긴다 — 판정 시각을 안에서 읽으면 테스트가 그 경계를 못 만든다.
 */
export function pendingInvitationWhere(now: Date) {
  return { acceptedAt: null, expiresAt: { gt: now } } satisfies Prisma.ProjectInvitationWhereInput;
}
