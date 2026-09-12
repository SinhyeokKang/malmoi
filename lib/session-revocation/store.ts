import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { hashSessionToken } from "@/lib/credentials/crypto";
import { pickLoginAccount } from "@/lib/login-link/policy";
import { challengeIdentifier, challengePrefix, checkChallenge, nonceHash, parseChallengeIdentifier, stateHash, validNonce, type Outcome } from "./policy";

type Proof = { nonce: string; sessionToken: string; state: string; provider: string; providerAccountId: string };
async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows.length === 1;
}
export async function beginRevocation(prisma: PrismaClient, input: Proof & { userId: string }): Promise<"ready" | "invalid" | "unavailable"> {
  if (!validNonce(input.nonce) || !input.state || !input.sessionToken || (input.provider !== "github" && input.provider !== "google")) return "invalid";
  const provider = input.provider;
  try {
    return await prisma.$transaction(async tx => {
      if (!await lockUser(tx, input.userId)) return "invalid";
      const now = new Date();
      const sessionDigest = hashSessionToken(input.sessionToken);
      const session = await tx.session.findFirst({ where: { userId: input.userId, sessionToken: sessionDigest, expires: { gt: now } } });
      const accounts = await tx.account.findMany({ where: { userId: input.userId, provider: { in: ["github", "google"] } }, select: { provider: true, providerAccountId: true } });
      /**
       * ⚠️ **`accounts.length !== 1`이던 자리다** (account-linking T6). 그 조건은 로그인 수단이
       * 둘이 되는 순간 회수를 **약하게 만드는 게 아니라 멈춰** 세웠고, 병합이 그 상태를 실제로
       * 만든다. 대신 서버가 **결정적으로** 하나를 고른다(`github` 우선) — 클라이언트가 고르게
       * 하면 공격자가 확인 상대를 고른다.
       */
      const chosen = pickLoginAccount(accounts);
      if (!session || chosen === null || chosen.provider !== provider || chosen.providerAccountId !== input.providerAccountId) return "invalid";
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: challengePrefix(input.userId) } } });
      await tx.verificationToken.create({ data: { identifier: challengeIdentifier({ userId: input.userId, provider, providerAccountId: input.providerAccountId, sessionDigest, stateDigest: stateHash(input.state) }), token: nonceHash(input.nonce), expires: new Date(now.getTime() + 300000) } });
      return "ready";
    });
  } catch { return "unavailable"; }
}
export async function finishRevocation(prisma: PrismaClient, input: Proof): Promise<Outcome> {
  if (!validNonce(input.nonce) || !input.state || !input.sessionToken) return "invalid";
  try {
    return await prisma.$transaction(async tx => {
      const row = await tx.verificationToken.findFirst({ where: { token: nonceHash(input.nonce), identifier: { startsWith: challengePrefix() } } });
      const challenge = row && parseChallengeIdentifier(row.identifier);
      if (!row || !challenge || !await lockUser(tx, challenge.userId)) return "invalid";
      // Read the clock after waiting for the lock: a queued callback must not revive an expired proof.
      const now = new Date();
      const decision = checkChallenge(challenge, { ...input, expires: row.expires, now });
      if (decision !== "ok") return decision;
      const session = await tx.session.findFirst({ where: { userId: challenge.userId, sessionToken: challenge.sessionDigest, expires: { gt: now } } });
      const account = await tx.account.findFirst({ where: { userId: challenge.userId, provider: challenge.provider, providerAccountId: challenge.providerAccountId }, select: { userId: true } });
      if (!session || !account) return "invalid";
      const consumed = await tx.verificationToken.deleteMany({ where: { identifier: row.identifier, token: row.token, expires: { equals: row.expires, gt: now } } });
      if (consumed.count !== 1) return "invalid";
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: challengePrefix(challenge.userId) } } });
      await tx.session.deleteMany({ where: { userId: challenge.userId } });
      return "revoked";
    });
  } catch { return "unavailable"; }
}
