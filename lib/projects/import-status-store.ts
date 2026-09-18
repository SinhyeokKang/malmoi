import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { importOutcomeFields } from "./import-status";
import type { ImportFailureCode, ReportedImportFailure } from "./import-status";

/**
 * 임포트 진행·결과의 **쓰기 껍데기** (PRODUCT §7.8). 판정은 `./import-status`가 하고
 * 여기는 DB만 안다.
 *
 * ⚠️ **인가는 호출부가 이미 했다** — Route Handler는 토큰으로, Server Action은 `getProjectAccess`로.
 * 여기 오는 `projectId`는 그 판정이 준 값이고 클라이언트가 준 slug가 아니다 (ARCHITECTURE §0 불변식 5).
 */

/**
 * 서버 적재가 시작됐다고 표시한다. **인증·가드를 지난 뒤**에 부른다 — 거부된 요청까지 표시하면
 * 목록이 돌지 않는 적재를 "진행 중"으로 그린다.
 */
export async function markImportStarted(prisma: PrismaClient, scope: { projectId: string; surfaceId: string }, startedAt: Date, token: string): Promise<void> {
  await prisma.translationSurface.update({ where: { id: scope.surfaceId, projectId: scope.projectId }, data: { lastImportStartedAt: startedAt, lastImportToken: token } });
}

/**
 * 서버 적재가 **아무것도 안 하고 끝났다** — 진행 표시만 거둔다(결과 필드는 건드리지 않는다).
 *
 * CI 적재가 판정 뒤 경합으로 보류됐을 때다(sync-edit-protection — ARCHITECTURE §5.5.2). 보류는 실패도 성공도 아니라서
 * `finishImportRun`으로 닫으면 마지막 실패·성공 기록이 거짓으로 바뀐다. 안 거두면 300초 "진행 중"이 남는다(POSTMORTEM 2026-09-15).
 * ⚠️ 자기 실행 토큰을 대조한다 — 그 사이 다른 실행의 표시를 뺏지 않는다. 쓰기 실패는 `finishImportRun`과 같은 이유로 삼킨다.
 */
export async function abandonImportRun(prisma: PrismaClient, input: { projectId: string; surfaceId: string; token: string }): Promise<void> {
  try {
    await prisma.translationSurface.updateMany({
      where: { id: input.surfaceId, projectId: input.projectId, lastImportToken: input.token },
      data: { lastImportStartedAt: null, lastImportToken: null },
    });
  } catch {
    // 삼킨다 — 위 주석.
  }
}

/**
 * 서버 적재의 **실패 종료**. 완전 성공·부분 실패는 `applyPush`의 트랜잭션이 확정하므로 여기 오지 않는다.
 *
 * ⚠️ **자기 실행 토큰을 대조한다.** 무조건 비우면 나중 실행이 앞선 실행의 진행 표시를 치우고,
 * 화면은 아직 돌고 있는 적재를 "끝났는데 실패"로 그린다.
 *
 * ⚠️ **자기 쓰기 실패를 삼킨다** — 호출부는 이 뒤에 **원래 오류**를 던지거나 500을 낸다. 여기서
 * 던지면 진단이 상태 기록 실패로 바뀌어 진짜 원인이 사라진다.
 */
export async function finishImportRun(
  prisma: PrismaClient,
  input: { projectId: string; surfaceId: string; token: string; code: ImportFailureCode },
): Promise<void> {
  try {
    await prisma.translationSurface.updateMany({
      where: { id: input.surfaceId, projectId: input.projectId, lastImportToken: input.token },
      /**
       * ⚠️ **종료 필드를 손으로 나열하지 않는다** — `importOutcomeFields`가 셋(코드·진행·실패
       * 시각)을 한 벌로 낸다. 나열하면 컬럼이 늘 때마다 경로 다섯 중 몇이 조용히 빠진다
       * (2026-09-15에 `lastImportFailedAt`이 실제로 그렇게 둘에만 붙었다).
       */
      data: { ...importOutcomeFields(input.code, new Date()), lastImportToken: null },
    });
  } catch {
    // 삼킨다 — 위 주석.
  }
}

/**
 * CI가 보고한 파싱 실패를 기록한다.
 *
 * ⚠️ **선조회로 통과시키고 무조건 UPDATE하지 않는다.** 조회와 쓰기 사이에 성공한 push가 들어오면
 * 오래된 실패가 그것을 덮는다. 인증에 쓴 토큰 해시·보관·커밋 순서를 **UPDATE의 `where`에 싣고**
 * 갱신 건수로 판정한다.
 *
 * ⚠️ **`lastCommitSha`·`lastCommitAt`을 건드리지 않는다** — 이 경로는 아무것도 적재하지 않았다.
 * 전진시키면 다음 정상 push가 자기 커밋으로 `stale-commit` 409를 받는다.
 *
 * ⚠️ **`lastImportStartedAt`도 건드리지 않는다** — 서버가 돌린 적 없는 구간이라 지울 진행이 없고,
 * 마침 다른 적재가 돌고 있다면 그 표시를 뺏는 것이 된다.
 */
export async function recordReportedFailure(
  prisma: PrismaClient,
  input: { projectId: string; surfaceId: string; tokenHash: string; commitAt: Date; code: ReportedImportFailure },
): Promise<"recorded" | "rejected"> {
  const { count } = await prisma.translationSurface.updateMany({
    where: {
      id: input.surfaceId,
      projectId: input.projectId,
      project: { pushTokenHash: input.tokenHash, archivedAt: null },
      archivedAt: null,
      // 같은 커밋의 재실행 실패는 받는다 — `checkCommitOrder`가 동일 시각을 통과시키는 것과 같은 규칙이다.
      OR: [{ lastCommitAt: null }, { lastCommitAt: { lte: input.commitAt } }],
    },
    /**
     * ⚠️ **시각도 함께 쓴다** (ARCHITECTURE §5) — Home의 항목이 세 종을 한 시간축에 세우고,
     * 그중 파서 실패의 시각이 여기서만 나온다. `lastImportError`만 쓰면 그 항목이 언제나
     * "가장 오래된 것"으로 바닥에 깔린다.
     */
    data: { lastImportError: input.code, lastImportFailedAt: new Date() },
  });
  return count === 1 ? "recorded" : "rejected";
}
