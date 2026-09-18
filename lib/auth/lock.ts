import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * `User` 행을 트랜잭션 끝까지 잠근다 — 없으면 `false`. 세 인증 왕복(회수 · 계정 연결 · 계정 병합)의 challenge 소비가
 * 같은 사용자에게 겹치지 않게 하는 자리다. 셋이 같은 SQL을 따로 들고 있었다(launch-readiness L7.4).
 */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows.length === 1;
}
