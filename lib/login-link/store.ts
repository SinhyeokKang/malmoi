import "server-only";
import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { findUserByEmail } from "@/lib/credentials/access";

import { planLinkConfirm, planLinkOffer, type LinkOffer } from "./plan";
import {
  CHALLENGE_TTL_MINUTES,
  challengeIdentifier,
  challengePrefix,
  challengeTokenHash,
  LOGIN_PROVIDERS,
  parseChallengeIdentifier,
  type LinkDest,
  type LinkOutcome,
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

/**
 * 확인 왕복의 끝 — **단일 사용 + 조건부 소비**다 (design 불변식 5).
 *
 * ⚠️ **실패는 challenge를 소비하지 않는다** (design ⑧) — 소비하면 훔친 URL 한 번으로 피해자의
 * 병합을 태울 수 있고, 안 해도 상한은 10분 TTL이 든다. 그래서 `planLinkConfirm`의 반환에
 * "이 갈래가 소비를 요구하는가"가 붙어 있고 여기가 그것을 읽는다.
 *
 * ⚠️ **`Account` 조회에 `userId`를 함께 걸 수 없는 자리가 하나 있다** — 확인 계정은 *누구 것인지*를
 * 묻는 조회라 PK로 찾고 그 `userId`를 **판정에 넘긴다**. 붙이는 쪽(`create`)은 challenge의
 * `userId`로만 쓴다.
 */
export async function finishLink(
  prisma: PrismaClient,
  input: { challengeToken: string; confirming: { provider: string; providerAccountId: string } },
): Promise<{ outcome: LinkOutcome; dest: LinkDest | null }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.verificationToken.findFirst({
        where: { token: challengeTokenHash(input.challengeToken), identifier: { startsWith: challengePrefix() } },
      });
      const challenge = row === null ? null : parseChallengeIdentifier(row.identifier);
      if (row === null || challenge === null || !(await lockUser(tx, challenge.userId))) {
        return { outcome: "invalid" as const, dest: null };
      }
      // 잠금을 기다린 뒤에 시계를 읽는다 — 대기 중이던 callback이 만료된 증명을 되살리지 못한다.
      const now = new Date();
      const [confirmed, pending] = await Promise.all([
        tx.account.findUnique({
          // 복합 PK `where`는 **정확히 두 키**여야 한다 — 호출부가 넓은 객체를 넘겨도 여기서 좁힌다.
          where: { provider_providerAccountId: { provider: input.confirming.provider, providerAccountId: input.confirming.providerAccountId } },
          select: { userId: true },
        }),
        tx.account.findUnique({
          where: { provider_providerAccountId: { provider: challenge.provider, providerAccountId: challenge.providerAccountId } },
          select: { userId: true },
        }),
      ]);
      const sameProvider = await tx.account.count({ where: { userId: challenge.userId, provider: challenge.provider } });
      const decision = planLinkConfirm({
        challenge,
        confirming: input.confirming,
        confirmedUserId: confirmed?.userId ?? null,
        pendingLinked: pending !== null || sameProvider > 0,
        expires: row.expires,
        now,
      });
      if (!decision.consume) return { outcome: decision.kind as LinkOutcome, dest: challenge.dest };
      // 소비를 조건부 삭제의 count가 강제한다 — 동시 요청 둘 중 **정확히 하나만** 성공한다.
      const consumed = await tx.verificationToken.deleteMany({
        where: { identifier: row.identifier, token: row.token, expires: { equals: row.expires, gt: now } },
      });
      if (consumed.count !== 1) return { outcome: "invalid" as const, dest: challenge.dest };
      /**
       * ⚠️ **토큰을 저장하지 않는다** — 로그인용 `github`·`google`의 access/refresh/id 토큰은 로그인
       * 이후 한 번도 쓰이지 않는다 (`safePrismaAdapter.linkAccount`와 같은 규칙, 발견 39).
       */
      await tx.account.create({
        data: {
          userId: challenge.userId,
          type: "oauth",
          provider: challenge.provider,
          providerAccountId: challenge.providerAccountId,
        },
      });
      return { outcome: "linked" as const, dest: challenge.dest };
    });
  } catch {
    return { outcome: "unavailable", dest: null };
  }
}
