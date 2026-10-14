import type { Prisma } from "@/generated/prisma/client";
import { readLocaleStates } from "@/lib/locales/work";
import { discardFingerprint, type LocaleChangeState } from "@/lib/protection/fingerprint";
import { loadPendingEdits } from "@/lib/protection/where";
import { REPO_COLUMNS } from "@/lib/repo-host/target";

/**
 * 수동 Sync 폐기 승인의 **발급과 재계산이 같은 함수다** (sync-edit-protection — ARCHITECTURE §5.5.2의 폐기 승인). 발급은 Dialog가 열릴 때
 * (`prepareRepositorySync`), 재계산은 실행권 트랜잭션의 Project 잠금 뒤다(`lib/import/run.ts`). 입력이 한 벌이어야
 * "같은 상태 → 같은 지문"이 선다 — 둘이 각자 입력을 모으면 한쪽에 필드가 늘 때 모든 승인이 reconfirm이 된다.
 *
 * ⚠️ **토큰 원문을 돌려주지만 화면으로 보내지 않는다** — 호출부(Action)는 `fingerprint`만 싣는다. `pending`은 적용 트랜잭션이
 * 승인 집합으로 upsert 가드에 넘기는 값이다.
 * ⚠️ `server-only`를 붙이지 않는다 — PG 통합 테스트가 직접 부른다.
 */
export async function readDiscardApproval(
  db: Prisma.TransactionClient,
  input: { projectId: string; userId: string },
): Promise<{ fingerprint: string; pending: { id: string; token: string }[]; localeChanges: LocaleChangeState[] }> {
  const repository = await db.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: { ...REPO_COLUMNS, baseBranch: true },
  });
  const surfaces = await db.translationSurface.findMany({
    where: { projectId: input.projectId, archivedAt: null },
    select: { id: true, importRevision: true, adapterName: true, pathTemplate: true, baseLocale: true },
  });
  const pending = await loadPendingEdits(db, input.projectId);
  const localeChanges = await readLocaleChangeStates(db, input.projectId);
  return { fingerprint: discardFingerprint({ userId: input.userId, projectId: input.projectId, repository, surfaces, pending, localeChanges }), pending, localeChanges };
}

/**
 * 승인 지문이 묶는 **언어 변경 상태** — 활성 소스 중 의도 행이나 비지 않은 전달 목록이 있는 것만(`readLocaleStates`). 수동 Sync와 소스 제거가 같은
 * 읽기를 쓴다 — 둘 다 의도를 지우므로 승인 대상이다(locale-add design §4). 비면 언어 변경이 없다.
 */
export async function readLocaleChangeStates(db: Prisma.TransactionClient, projectId: string, surfaceId?: string): Promise<LocaleChangeState[]> {
  const states = await readLocaleStates(db, projectId, surfaceId);
  return states.map(state => ({
    surfaceId: state.surfaceId,
    rows: state.rows.map(row => ({ localeCode: row.localeCode, operation: row.operation, requestedAt: row.requestedAt.toISOString() })),
    delivered: state.delivered,
  }));
}
