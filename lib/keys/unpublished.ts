import type { Prisma } from "@/generated/prisma/client";

/**
 * "아직 안 보낸 편집" 술어의 **집계용 where 하나.** `countUnpublished`(`./query`)와 pull의 1층 스킵
 * (`lib/pull/load.ts`)이 같은 객체를 쓴다 — 술어 사본이 늘어날 자리에 사본 대신 공유 조각을 둔다
 * (launch-readiness L3.10이 사본 넷을 세고 있다; 여기서 다섯째를 만들지 않는다).
 *
 * ⚠️ **`updatedBy: { not: null }`이 빠지면 안 된다.** push가 전 행의 `updatedAt`을 올리므로 그 조건이
 * 없으면 push 직후 903키 전부가 "안 보낸 편집"이 된다 — 1층 스킵이 그 이유로 `max(updatedAt)` 비교에서
 * 이 술어로 옮겨 왔다(sync-edit-protection T0, 2026-09-17).
 *
 * ⚠️ 잎 모듈이다 — `server-only`를 붙이지 않는다. `lib/pull/load.ts`가 스크립트·테스트에서 열린다.
 */
export function unpublishedWhere(
  projectId: string,
  lastPulledAt: Date | null,
  surfaceId?: string,
): Prisma.TranslationWhereInput {
  return {
    projectId,
    surfaceId,
    surface: { archivedAt: null },
    updatedBy: { not: null },
    // 한 번도 안 보냈으면 사람이 만진 행이 전부 미배포다 — 비교 대상이 없다.
    ...(lastPulledAt === null ? {} : { updatedAt: { gt: lastPulledAt } }),
  };
}
