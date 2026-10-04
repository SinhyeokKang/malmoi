import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { maskEmail } from "@/lib/auth/email";
import { decodeInvitation, decodeUser, readable } from "@/lib/credentials/records";
import type { Messages } from "@/lib/i18n";
import type { EventPayload } from "./payload";

/**
 * 멤버 사건의 **대상 라벨** (logs-rework spec §3.C.14).
 *
 * ⚠️ **원문 이메일이 payload에 들어가지 않는다.** 이벤트는 지우지 않으므로, 여기서 원문을 쓰면
 * 계정 삭제 뒤에도 주소가 이력에 남는다 — `actorUserId SetNull`이 그것을 지우지 못한다.
 *
 * ⚠️ **`maskedEmailLabels`가 아니라 `maskEmail`이다.** 그쪽은 **목록 전체를 보고** 충돌하는 행만
 * 더 보여 주는데(malmoi#18), 사건 하나에는 볼 목록이 없다 — 여기서 목록 규칙을 흉내내면 같은
 * 주소가 저장 시점에 따라 다른 라벨로 굳는다. 목록 라벨은 조회가 따로 만든다.
 *
 * ⚠️ **대체 라벨은 영어로 고정한다**(`en`) — payload에 굳어 지워지지 않으므로, 쓴 사람의 화면 언어를 따르면
 * 같은 이력이 사건마다 다른 언어로 남는다.
 */
/**
 * **저장되는 대체 라벨의 고정 값이다** — `ProjectEvent.payload.targetLabel`에 굳어 지워지지 않으므로, en 사전 문구를 나중에 고쳐도 **옛 사건은 이 값으로 남아 있다.**
 * 그래서 쓰기(아래 두 함수)와 읽기 치환(`displayMemberPayload`)이 사전 값이 아니라 이 상수를 쓴다. `member-label.test.ts`가 "지금은 en 사전과 같다"를 단언한다 —
 * en 문구를 바꾸려면 그 테스트가 red가 되고, 그때 **옛 값을 이 상수로 남겨(새 문구는 사전만 바꿔) 옛 저장값의 치환이 끊기지 않게 한다.**
 */
export const STORED_REMOVED_USER = "Removed user";
export const STORED_UNREADABLE = "Unavailable";

export async function userEventLabel(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const row = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailLookup: true } });
  if (row === null) return STORED_REMOVED_USER;
  const user = readable(() => decodeUser(row));
  // 복호 실패는 "없음"이 아니다 — 같은 낱말을 화면이 이미 쓴다.
  if (user === null) return STORED_UNREADABLE;
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
  if (row === null) return STORED_UNREADABLE;
  const invitation = readable(() => decodeInvitation(row));
  return invitation === null ? STORED_UNREADABLE : maskEmail(invitation.email);
}

/**
 * **저장된 대체 라벨을 읽는 화면의 언어로 되돌린다** — 위 두 낱말은 en으로 굳어 있으니(지우지 않는 사건) Logs가 읽을 때만 사전의 **같은 키**로 바꾼다.
 * 그 밖의 `targetLabel`(마스킹 주소)은 그대로다. ⚠️ **저장값은 건드리지 않는다** — 조회가 만든 행 모델에서만 바뀐다.
 */
export function displayMemberPayload(m: Messages, payload: EventPayload | null): EventPayload | null {
  if (payload === null || payload.kind !== "MEMBER") return payload;
  if (payload.targetLabel === STORED_REMOVED_USER) return { ...payload, targetLabel: m.logs.trigger.removed };
  if (payload.targetLabel === STORED_UNREADABLE) return { ...payload, targetLabel: m.common.unreadable };
  return payload;
}
