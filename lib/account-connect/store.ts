import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { hashSessionToken } from "@/lib/credentials/crypto";
import { decodeUser } from "@/lib/credentials/records";
import { lookupEmail } from "@/lib/credentials/storage";
import { isLoginProvider, type LoginProvider } from "@/lib/login-link/policy";
import { connectChallengeIdentifier, connectChallengePrefix, parseConnectChallenge, planLoginMethodLink, type ConnectOutcome } from "./plan";
import { lockUser } from "@/lib/auth/lock";
import { isUniqueViolation } from "@/lib/failure";

function digest(kind: "nonce" | "state", raw: string): string {
  return createHash("sha256").update(`malmoi/account-connect/${kind}/v1\0${raw}`).digest("hex");
}
function validNonce(raw: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(raw) && Buffer.from(raw, "base64url").toString("base64url") === raw; }
type Start = { userId: string; provider: LoginProvider; nonce: string; sessionToken: string; state: string };
export async function beginConnect(prisma: PrismaClient, input: Start): Promise<"ready" | ConnectOutcome> {
  if (!isLoginProvider(input.provider) || !validNonce(input.nonce) || !input.sessionToken || !input.state) return "failed";
  let stage = "session";
  try {
    return await prisma.$transaction(async tx => {
      if (!await lockUser(tx, input.userId)) return "wrong-user";
      const now = new Date();
      const sessionDigest = hashSessionToken(input.sessionToken);
      const session = await tx.session.findFirst({ where: { userId: input.userId, sessionToken: sessionDigest, expires: { gt: now } } });
      if (!session) return "wrong-user";
      if (await tx.account.count({ where: { userId: input.userId, provider: input.provider } })) return "already-connected";
      stage = "email";
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true, email: true } });
      const emailLookup = lookupEmail(decodeUser(user).email);
      stage = "challenge";
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: connectChallengePrefix(input.userId) } } });
      await tx.verificationToken.create({ data: { identifier: connectChallengeIdentifier({ userId: input.userId, provider: input.provider, emailLookup, sessionDigest, stateDigest: digest("state", input.state) }), token: digest("nonce", input.nonce), expires: new Date(now.getTime() + 300_000) } });
      return "ready";
    });
  } catch { console.error("Account connect begin failed.", { stage }); return "failed"; }
}
type Proof = { nonce: string; sessionToken: string; state: string; provider: string; providerAccountId: string; verifiedEmail: string | null };
export async function finishConnect(prisma: PrismaClient, input: Proof): Promise<ConnectOutcome> {
  if (!validNonce(input.nonce)) return "expired";
  if (!input.sessionToken) return "wrong-user";
  if (!input.state || !isLoginProvider(input.provider) || !input.providerAccountId) return "failed";
  let stage = "challenge";
  try {
    return await prisma.$transaction(async tx => {
      // 목적에 묶인 nonce 조회가 소유자를 찾고, 이후의 읽기·소비는 전부 그 소유자에 묶인다.
      const row = await tx.verificationToken.findFirst({ where: { token: digest("nonce", input.nonce), identifier: { startsWith: connectChallengePrefix() } } });
      const c = row && parseConnectChallenge(row.identifier);
      if (!row || !c || !await lockUser(tx, c.userId)) return "expired";
      // 소유자 잠금을 기다리는 동안 다른 callback·시작이 이 challenge를 소비하거나 바꿀 수 있다.
      const current = await tx.verificationToken.findUnique({ where: { identifier_token: { identifier: row.identifier, token: row.token } } });
      if (!current) return "expired";
      const now = new Date();
      stage = "session";
      const session = await tx.session.findFirst({ where: { userId: c.userId, sessionToken: hashSessionToken(input.sessionToken), expires: { gt: now } } });
      stage = "ownership";
      // 소유 조회는 일부러 사용자 경계를 넘는다 — 계정을 쓰기 전에 거부한다.
      const existing = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } }, select: { userId: true } });
      const decision = planLoginMethodLink({ challenge: { ...c, expires: current.expires }, sessionUserId: session?.userId ?? null, provider: input.provider,
        providerLookup: input.verifiedEmail ? lookupEmail(input.verifiedEmail) : null, existing, state: digest("state", input.state), sessionToken: hashSessionToken(input.sessionToken), now });
      if (decision !== "connected") return decision;
      stage = "email";
      const user = await tx.user.findUniqueOrThrow({ where: { id: c.userId }, select: { id: true, email: true } });
      if (lookupEmail(decodeUser(user).email) !== c.emailLookup) return "email-mismatch";
      if (await tx.account.count({ where: { userId: c.userId, provider: c.provider } })) return "already-connected";
      stage = "consume";
      const consumed = await tx.verificationToken.deleteMany({ where: { identifier: current.identifier, token: current.token, expires: { equals: current.expires, gt: now } } });
      if (consumed.count !== 1) return "expired";
      stage = "account";
      await tx.account.create({ data: { userId: c.userId, type: "oauth", provider: c.provider, providerAccountId: input.providerAccountId } });
      return "connected";
    });
  } catch (error) {
    // 중단된 트랜잭션 밖에서 다시 조회한다 — 유일성 경합이 소유권을 옮기면 안 된다.
    if (isUniqueViolation(error)) {
      stage = "uniqueness-recheck";
      try {
        const session = await prisma.session.findFirst({ where: { sessionToken: hashSessionToken(input.sessionToken), expires: { gt: new Date() } }, select: { userId: true } });
        const existing = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } }, select: { userId: true } });
        if (session && existing) return existing.userId === session.userId ? "already-connected" : "taken-by-other";
      } catch { /* 이 경계 밖으로는 정해진 결과만 나간다. */ }
    }
    console.error("Account connect finish failed.", { stage });
    return "failed";
  }
}
