import type { Prisma } from "@/generated/prisma/client";

/**
 * **토큰 술어** — 활성 표면 · 활성 키 · 활성 로케일에서 아직 전달 확인되지 않은 편집 (sync-edit-protection design §2).
 *
 * 배포 A에서는 Publish 캡처만 이것을 쓴다. 미전달 집계·1층 스킵(`lib/keys/unpublished.ts`)은 배포 B(T8)에서 옮긴다.
 *
 * ⚠️ **orphan 키·로케일을 뺀다.** 그 셀은 export에 안 나가므로 캡처해 해제하면 "보내지 않은 편집을 보냈다"가 된다 (완료 조건 9).
 * `stringKey`·`locale` 관계는 `projectId`·`surfaceId`를 공유하는 3열 복합 FK라 테넌트 경계를 넘지 않는다.
 */
export function pendingWhere(projectId: string, surfaceId?: string): Prisma.TranslationWhereInput {
  return {
    projectId,
    ...(surfaceId === undefined ? {} : { surfaceId }),
    surface: { archivedAt: null },
    stringKey: { orphaned: false },
    locale: { orphaned: false },
    pendingEditToken: { not: null },
  };
}
