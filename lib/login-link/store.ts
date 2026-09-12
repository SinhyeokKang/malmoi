import "server-only";
import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { findUserByEmail } from "@/lib/credentials/access";

import { planLinkOffer, type LinkOffer } from "./plan";
import {
  CHALLENGE_TTL_MINUTES,
  challengeIdentifier,
  challengePrefix,
  challengeTokenHash,
  LOGIN_PROVIDERS,
  type LinkDest,
  type LoginProvider,
} from "./policy";

/**
 * challenge의 DB 껍데기 — `lib/session-revocation/store.ts`와 같은 형이다.
 *
 * ⚠️ **`VerificationToken`을 목적 접두로 재사용한다** — 이메일 provider를 안 써서 비어 있고,
 * `session-revocation`이 이미 그 관용구다. 접두가 갈려 있어 **두 목적의 요청이 서로를 소비하지
 * 않는다.**
 *
 * ⚠️ **모든 조회·삭제에 `userId`를 함께 건다** — `Account` PK가 `(provider, providerAccountId)`라
 * 그 둘만으로 남의 행에 닿는다 (POSTMORTEM 2026-09-06).
 */

export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows.length === 1;
}

/**
 * "이 로그인을 거부할 것인가, 안내할 것인가."
 *
 * ⚠️ **조회는 새 Account일 때만 한다** (design §5.1) — 호출부가 `refreshVerifiedEmail`의 결과로
 * 이미 "이 Account가 새 것인가"를 알고 있고, 재방문 로그인(대부분)에는 이 함수가 아예 안 불린다.
 */
export async function loadLinkOffer(
  prisma: PrismaClient,
  input: { provider: string; providerAccountId: string; verifiedEmail: string | null },
): Promise<LinkOffer> {
  if (input.verifiedEmail === null || input.verifiedEmail === "") {
    return planLinkOffer({ ...input, existingUser: null });
  }
  const user = await findUserByEmail(prisma, input.verifiedEmail);
  if (user === null) return planLinkOffer({ ...input, existingUser: null });
  const accounts = await prisma.account.findMany({
    where: { userId: user.id, provider: { in: [...LOGIN_PROVIDERS] } },
    select: { provider: true },
  });
  return planLinkOffer({ ...input, existingUser: { id: user.id, methods: accounts.map((a) => a.provider) } });
}

/**
 * challenge를 굽고 **URL에 실을 원문 토큰**을 낸다. DB엔 해시만 남는다 (불변식 4).
 *
 * ⚠️ **자기 접두로 좁혀 지운다** — 같은 사용자가 Google을 두 번 시도하면 행이 둘이 되고, 넓게
 * 지우면 `session-revocation`의 목적을 소비한다.
 */
export async function beginLink(
  prisma: PrismaClient,
  input: { userId: string; provider: LoginProvider; providerAccountId: string; dest: LinkDest },
): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  try {
    const ok = await prisma.$transaction(async (tx) => {
      if (!(await lockUser(tx, input.userId))) return false;
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: challengePrefix(input.userId) } } });
      await tx.verificationToken.create({
        data: {
          identifier: challengeIdentifier(input),
          token: challengeTokenHash(token),
          expires: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
        },
      });
      return true;
    });
    return ok ? token : null;
  } catch {
    return null;
  }
}
