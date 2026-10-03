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
 * - `alsoLock` — **잠그되 세지 않는** User. 사건(`ProjectEvent.actorUserId`)의 FK가 INSERT 때 행위자 User 행에 `KEY SHARE`를 걸고
 *   그것은 `FOR UPDATE`와 충돌한다 — 행위자를 이 정렬 집합 밖에 두면 맞승격(P1에서 X가 T를, P2에서 T가 X를)이나 X·T가 함께
 *   OWNER인 프로젝트의 복원과 순환이 생긴다(review-R1 🟡1). 그래서 승격은 행위자를 여기 함께 넘긴다(셈에 넣으면 이미 OWNER인
 *   행위자 때문에 거부가 잘못 난다).
 *   ⚠️ **잠금 순서**: 호출부가 `lockProjectAccess`(Project)를 먼저 잡고, 그 뒤 여기가 (행위자 포함) User를 **id 순**으로 잡는다.
 *   이 뒤에 각 경로가 잡는 잠금(사건의 Project·actor FK, 멤버 행)은 이미 쥔 행이다. 생성은 User만, 수락은 수락자만 잡고 그
 *   수락자는 아직 그 프로젝트의 멤버가 아니라 복원·승격이 기다릴 수 없다 — 그래서 생성·복원·승격·수락 사이에 Project↔User·
 *   User↔User 순환이 없다.
 * - 상한에 닿은 사람만 운영자를 조회한다 — 그렇지 않은 사람의 비용은 셈 하나다.
 * - 운영자 조회 실패는 던진다(catch 없음) — 호출부 트랜잭션이 롤백된다.
 * - 이미 상한을 넘긴 상태는 고치지 않는다 — 늘리는 요청만 거부한다(C9).
 */
export async function lockOwnerSlots(
  tx: Prisma.TransactionClient,
  counted: readonly string[],
  alsoLock: readonly string[] = [],
): Promise<string[]> {
  for (const id of [...new Set([...counted, ...alsoLock])].sort()) {
    await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }
  const over: string[] = [];
  for (const id of [...new Set(counted)].sort()) {
    const owned = await tx.projectMember.count({ where: ownedActiveProjects(id) });
    if (owned >= PROJECT_LIMIT && !(await isOperatorUser(tx, id))) over.push(id);
  }
  return over;
}
