import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { planProjectReadiness } from "@/lib/onboarding/readiness";

/**
 * `ready` 판정 — 컬럼을 만들지 않고 기존 두 컬럼으로 본다 (`planProjectReadiness`, PRODUCT §7.5).
 * **`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다** — `applyPush`가 그것을 키·번역·refs와
 * 한 배열형 트랜잭션에서 쓰므로 부분 성공 상태가 없다.
 *
 * ⚠️ **`projectId`로 좁힌다** — 인가가 돌려준 값이고, slug로 다시 찾으면 클라이언트 입력이 조회
 * 조건이 된다.
 */
export async function isProjectReady(prisma: PrismaClient, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { installationId: true, surfaces: { select: { archivedAt: true, lastCommitSha: true } } },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 준비된 것으로 읽지 않는다.
  if (project === null) return false;
  return planProjectReadiness(project) === "ready";
}
