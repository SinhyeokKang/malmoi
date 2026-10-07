import type { Prisma } from "@/generated/prisma/client";

/**
 * 자동 적재 사전 판정의 전달 확인 장벽. no-changes도 새 revision을 쓰지만 표시용 lastPublishedAt은 그대로다.
 * Project 잠금 뒤 같은 집합과 대조한다. 무효화·보관으로 행을 빼지 않는다 — 과거 확인도 이후 적재가 관측해야 한다.
 * revision은 확인마다 새 UUID라 같은 값·토큰·밀리초의 재확인도 구별된다. 값 자체는 읽지 않는다.
 */
export async function readDeliveryRevision(
  db: { deliveryConfirmation: Pick<Prisma.TransactionClient["deliveryConfirmation"], "findMany"> },
  projectId: string,
): Promise<string> {
  const rows = await db.deliveryConfirmation.findMany({
    where: { projectId }, select: { surfaceId: true, revision: true }, orderBy: { surfaceId: "asc" },
  });
  return JSON.stringify(rows.map(row => [row.surfaceId, row.revision] as const).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
