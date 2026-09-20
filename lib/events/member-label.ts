import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { maskEmail } from "@/lib/auth/email";
import { decodeInvitation, decodeUser, readable } from "@/lib/credentials/records";
import { m } from "@/lib/i18n";

/**
 * 멤버 사건의 **대상 라벨** (logs-rework spec §3.C.14).
 *
 * ⚠️ **원문 이메일이 payload에 들어가지 않는다.** 이벤트는 지우지 않으므로, 여기서 원문을 쓰면
 * 계정 삭제 뒤에도 주소가 이력에 남는다 — `actorUserId SetNull`이 그것을 지우지 못한다.
 *
 * ⚠️ **`maskedEmailLabels`가 아니라 `maskEmail`이다.** 그쪽은 **목록 전체를 보고** 충돌하는 행만
 * 더 보여 주는데(malmoi#18), 사건 하나에는 볼 목록이 없다 — 여기서 목록 규칙을 흉내내면 같은
 * 주소가 저장 시점에 따라 다른 라벨로 굳는다. 목록 라벨은 조회가 따로 만든다.
 */
export async function userEventLabel(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const row = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailLookup: true } });
  if (row === null) return m.logs.trigger.removed;
  const user = readable(() => decodeUser(row));
  // 복호 실패는 "없음"이 아니다 — 같은 낱말을 화면이 이미 쓴다.
  if (user === null) return m.common.unreadable;
  // 이름은 계정 삭제가 지우지 못하는 사본이 된다 — 영구 사건에는 마스킹 주소만 남긴다.
  return maskEmail(user.email);
}

export async function invitationEventLabel(
  tx: Prisma.TransactionClient,
  where: { projectId: string; invitationId: string },
): Promise<string> {
  // ⚠️ **`projectId`로 함께 좁힌다** — id를 알아도 남의 테넌트 행을 읽을 수 없어야 한다.
  const row = await tx.projectInvitation.findFirst({
    where: { id: where.invitationId, projectId: where.projectId },
    select: { id: true, projectId: true, email: true, emailLookup: true },
  });
  if (row === null) return m.common.unreadable;
  const invitation = readable(() => decodeInvitation(row));
  return invitation === null ? m.common.unreadable : maskEmail(invitation.email);
}
