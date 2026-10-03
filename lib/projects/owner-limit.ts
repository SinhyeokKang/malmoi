import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { PROJECT_LIMIT } from "@/lib/onboarding/create-plan";
import { ownedActiveProjects } from "@/lib/onboarding-run/repos";
import { isOperatorUser } from "@/lib/operator/user";

/**
 * **활성 OWNER 프로젝트를 하나 늘리는 쓰기의 상한 재집계** — 복원·OWNER 승격·OWNER 초대 수락 (operator-account C6~C8). 상한이 생성에만
 * 걸려 있으면 "보관 → 생성 → 복원"으로 누구나 넷을 넘긴다. 돌려주는 것은 **늘면 상한을 넘는 비운영자** id이고, 비면 통과다.
 *
 * 판정의 단위는 생성 경로와 같다(`ownedActiveProjects` · `PROJECT_LIMIT` · `isOperatorUser`) — 갈리면 한 자리가 통과시킨 것을 다른
 * 자리가 거부한다. 생성의 재집계(`createProjectFromRepo`)는 이리로 옮기지 않았다 — 잠금이 이미 있고 상한을 tx 밖에서 한 번 계산한다.
 *
 * - **잠그고 센다** — 생성과 같은 `User` 행 잠금이라 같은 사용자의 동시 생성·복원·승격이 줄을 선다(2026-09-07 리뷰 🟡7의 계보).
 *   ⚠️ **잠금 순서**: 호출부가 `lockProjectAccess`(Project)를 먼저 잡고 그 뒤에 여기가 User를 잡는다. 생성은 User만 잡으므로
 *   Project↔User 역순이 없고, 여러 User는 **id 순**이라 서로 교착하지 않는다.
 * - 상한에 닿은 사람만 운영자를 조회한다 — 그렇지 않은 사람의 비용은 셈 하나다.
 * - 운영자 조회 실패는 던진다(catch 없음) — 호출부 트랜잭션이 롤백된다.
 * - 이미 상한을 넘긴 상태는 고치지 않는다 — 늘리는 요청만 거부한다(C9).
 */
export async function lockOwnerSlots(tx: Prisma.TransactionClient, userIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(userIds)].sort();
  for (const id of ids) await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  const over: string[] = [];
  for (const id of ids) {
    const owned = await tx.projectMember.count({ where: ownedActiveProjects(id) });
    if (owned >= PROJECT_LIMIT && !(await isOperatorUser(tx, id))) over.push(id);
  }
  return over;
}
