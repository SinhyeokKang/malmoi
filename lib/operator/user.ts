import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { lookupEmail } from "@/lib/credentials/storage";
import { optionalEnv } from "@/lib/env";

import { parseOperatorEmails } from "./allowlist";

/**
 * 이 사용자가 운영자인가 — 정적 allowlist(`OPERATOR_EMAILS`)의 주소가 그 사람의 주소인가. **계정 축 쿼터만** 바꾸는
 * 판정이고 인가(`ProjectMember`)가 아니다 — 소비자는 프로젝트 상한 자리뿐이다(`user.test.ts`가 import를 센다).
 *
 * - env는 **호출마다** 읽는다 — 모듈 최상위·기본 인자에서 평가하면 `.env` 없는 빌드가 import만으로 죽는다
 *   (POSTMORTEM 2026-08-31). `source`는 테스트·postgres 스위트가 셸 env에 기대지 않게 하는 주입점이다.
 * - 집합이 비면 DB를 읽지 않는다 — 운영자가 없는 환경의 비용 0.
 * - 비교는 `User.emailLookup` 하나다 — 병합·로그인이 그 값을 만든 것과 같은 HMAC(안에서 `normalizeEmail`)이라
 *   대소문자만 다른 env 주소도 맞는다. 봉투(`User.email`)를 열 이유가 없다. `null`(전환 미채움)은 운영자가 아니고,
 *   lookup 키 회전 도중 옛 키로 남은 행도 일치하지 않는다 — 둘 다 fail-closed다.
 * - ⚠️ **catch하지 않는다** — 조회 실패를 "운영자 아님"으로 접으면 장애가 상한 거부로 보인다(POSTMORTEM 2026-09-03).
 *   호출부의 기존 실패 경로(①의 `unavailable`, 트랜잭션 롤백)를 탄다.
 */
export async function isOperatorUser(
  db: Pick<PrismaClient, "user"> | Prisma.TransactionClient,
  userId: string,
  source: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const emails = parseOperatorEmails(optionalEnv("OPERATOR_EMAILS", source));
  if (emails.size === 0) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailLookup: true } });
  const stored = user?.emailLookup ?? null;
  if (stored === null) return false;
  return [...emails].some((email) => lookupEmail(email) === stored);
}
