import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { hashSessionToken } from "@/lib/credentials/crypto";
import { logCaught } from "@/lib/failure";
import { isLoginProvider, LOGIN_PROVIDERS, pickLoginAccount, type LoginProvider } from "@/lib/login-link/policy";
import { challengeIdentifier, challengePrefix, checkChallenge, nonceHash, parseChallengeIdentifier, stateHash, type Outcome } from "./policy";
import { validNonce } from "@/lib/auth/roundtrip";
import { lockUser } from "@/lib/auth/lock";

type Proof = { nonce: string; sessionToken: string; state: string; provider: string; providerAccountId: string };
/**
 * ⚠️ **`enabled`는 Action이 확인 상대를 고를 때 쓴 것과 같은 값이어야 한다** (optional-login-providers design §2.4) — 아래 대조
 * (`chosen.provider !== provider`)가 "서버가 고른 상대"를 다시 고르는 것이라, 둘이 다른 켜진 집합을 보면 대조가 성립하지 않는다.
 * 우주는 `LOGIN_PROVIDERS` 파생이다 — 손 사본을 두면 셋째 공급자 때 한 곳만 바뀌어 사본 간 정합이 깨진다(gitlab-oauth design §3).
 */
export async function beginRevocation(prisma: PrismaClient, input: Proof & { userId: string; enabled: readonly LoginProvider[] }): Promise<"ready" | "invalid" | "unavailable"> {
  if (!validNonce(input.nonce) || !input.state || !input.sessionToken || !isLoginProvider(input.provider)) return "invalid";
  const provider = input.provider;
  try {
    return await prisma.$transaction(async tx => {
      if (!await lockUser(tx, input.userId)) return "invalid";
      const now = new Date();
      const sessionDigest = hashSessionToken(input.sessionToken);
      const session = await tx.session.findFirst({ where: { userId: input.userId, sessionToken: sessionDigest, expires: { gt: now } } });
      const accounts = await tx.account.findMany({ where: { userId: input.userId, provider: { in: [...LOGIN_PROVIDERS] } }, select: { provider: true, providerAccountId: true } });
      /**
       * ⚠️ **`accounts.length !== 1`이던 자리다** (account-linking T6). 그 조건은 로그인 수단이
       * 둘이 되는 순간 회수를 **약하게 만드는 게 아니라 멈춰** 세웠고, 병합이 그 상태를 실제로
       * 만든다. 대신 서버가 **결정적으로** 하나를 고른다(`LOGIN_PROVIDERS` 순서) — 클라이언트가 고르게
       * 하면 공격자가 확인 상대를 고른다.
       */
      const chosen = pickLoginAccount(accounts, input.enabled);
      if (!session || chosen === null || chosen.provider !== provider || chosen.providerAccountId !== input.providerAccountId) return "invalid";
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: challengePrefix(input.userId) } } });
      await tx.verificationToken.create({ data: { identifier: challengeIdentifier({ userId: input.userId, provider, providerAccountId: input.providerAccountId, sessionDigest, stateDigest: stateHash(input.state) }), token: nonceHash(input.nonce), expires: new Date(now.getTime() + 300000) } });
      return "ready";
    });
  } catch (error) { logCaught("session-revocation", "begin", error); return "unavailable"; }
}
export async function finishRevocation(prisma: PrismaClient, input: Proof): Promise<Outcome> {
  if (!validNonce(input.nonce) || !input.state || !input.sessionToken) return "invalid";
  try {
    return await prisma.$transaction(async tx => {
      const row = await tx.verificationToken.findFirst({ where: { token: nonceHash(input.nonce), identifier: { startsWith: challengePrefix() } } });
      const challenge = row && parseChallengeIdentifier(row.identifier);
      if (!row || !challenge || !await lockUser(tx, challenge.userId)) return "invalid";
      // 잠금을 기다린 뒤에 시계를 읽는다 — 대기 중이던 callback이 만료된 증명을 되살리면 안 된다.
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
      /**
       * ⚠️ **세션으로 만든 장기 자격증명도 함께 끝낸다** (2026-10-17 보안 감사). 세션 하나면 MCP 개인 토큰(최대 365일)을 발급하거나 OAuth
       * 동의를 승인할 수 있다 — 세션만 지우면 잃어버린 기기에서 만든 그 자격증명이 회수 뒤에도 `/api/mcp`에서 쓰기를 계속한다.
       * 미교환 code는 동의의 산물이라 같이 지운다(60초 안에 연결로 바뀔 수 있다). refresh 이력은 연결을 따라 cascade다.
       */
      await tx.apiToken.deleteMany({ where: { userId: challenge.userId } });
      await tx.oAuthConnection.deleteMany({ where: { userId: challenge.userId } });
      await tx.oAuthCode.deleteMany({ where: { userId: challenge.userId } });
      return "revoked";
    });
  } catch (error) { logCaught("session-revocation", "finish", error); return "unavailable"; }
}
