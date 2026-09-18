import type { Prisma } from "@/generated/prisma/client";

/**
 * **토큰 술어** — 활성 표면 · 활성 키 · 활성 로케일에서 아직 전달 확인되지 않은 편집 (sync-edit-protection — ARCHITECTURE §5의 `pendingEditToken`).
 *
 * **미전달 술어의 주인은 여기 하나다** — `countUnpublished`·pull 1층·Publish 캡처·Publish 미리보기가 이 객체를 쓰고,
 * 손 사본은 셀 투영(`lib/keys/query.ts` `loadKeys`의 `pending`)과 목록 raw SQL ⑤뿐이다(`pnpm test:projects:postgres`가 대조한다).
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

/**
 * `pendingWhere`로 센다 — **토큰 컬럼만 보는 count가 0이면 관계 조인을 돌리지 않는다.**
 *
 * ⚠️ 관계 필터(surface·stringKey·locale)는 Prisma가 LEFT JOIN 셋으로 풀고, 대량 적재 직후 통계가 낡으면 플래너가
 * 조인부터 돌아 `[projectId, pendingEditToken]` 인덱스를 버린다 — 격리 PG 8,676행에서 5.5초였고 `ANALYZE` 뒤 13ms였다
 * (2026-09-18 실측). 온보딩 직후 첫 CI push가 그 창에 든다. 토큰 없는 프로젝트가 흔한 경우라 첫 count가 인덱스만 타고 끝난다.
 * 결과는 같다 — 술어의 행은 토큰 있는 행의 부분집합이다.
 */
export async function countPending(
  db: { translation: { count(args: { where: Prisma.TranslationWhereInput }): Promise<number> } },
  projectId: string,
  surfaceId?: string,
): Promise<number> {
  const tokens = await db.translation.count({ where: { projectId, ...(surfaceId === undefined ? {} : { surfaceId }), pendingEditToken: { not: null } } });
  if (tokens === 0) return 0;
  return db.translation.count({ where: pendingWhere(projectId, surfaceId) });
}

/**
 * `pendingWhere` 셀의 `(id, token)` — 토큰 원문이라 **서버 안에서만** 쓴다(Publish 캡처 · 폐기 승인 지문).
 * `countPending`과 같은 이유로 토큰 컬럼만 보는 count가 0이면 관계 조인을 돌리지 않는다.
 */
export async function loadPendingEdits(
  db: {
    translation: {
      count(args: { where: Prisma.TranslationWhereInput }): Promise<number>;
      findMany(args: { where: Prisma.TranslationWhereInput; select: { id: true; pendingEditToken: true } }): Promise<{ id: string; pendingEditToken: string | null }[]>;
    };
  },
  projectId: string,
): Promise<{ id: string; token: string }[]> {
  const tokens = await db.translation.count({ where: { projectId, pendingEditToken: { not: null } } });
  if (tokens === 0) return [];
  const rows = await db.translation.findMany({ where: pendingWhere(projectId), select: { id: true, pendingEditToken: true } });
  return rows.flatMap(row => row.pendingEditToken === null ? [] : [{ id: row.id, token: row.pendingEditToken }]);
}
