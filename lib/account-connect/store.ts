import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { hashSessionToken } from "@/lib/credentials/crypto";
import { decodeUser } from "@/lib/credentials/records";
import { lookupEmail } from "@/lib/credentials/storage";
import { isLoginProvider, type LoginProvider } from "@/lib/login-link/policy";
import { connectChallengeIdentifier, connectChallengePrefix, parseConnectChallenge, planLoginMethodLink, type ConnectOutcome } from "./plan";

function digest(kind: "nonce" | "state", raw: string): string {
  return createHash("sha256").update(`malmoi/account-connect/${kind}/v1\0${raw}`).digest("hex");
}
function validNonce(raw: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(raw) && Buffer.from(raw, "base64url").toString("base64url") === raw; }
async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows.length === 1;
}
type Start = { userId: string; provider: LoginProvider; nonce: string; sessionToken: string; state: string };
export async function beginConnect(prisma: PrismaClient, input: Start): Promise<"ready" | ConnectOutcome> {
  if (!isLoginProvider(input.provider) || !validNonce(input.nonce) || !input.sessionToken || !input.state) return "failed";
  try {
    return await prisma.$transaction(async tx => {
      if (!await lockUser(tx, input.userId)) return "wrong-user";
      const now = new Date();
      const sessionDigest = hashSessionToken(input.sessionToken);
      const session = await tx.session.findFirst({ where: { userId: input.userId, sessionToken: sessionDigest, expires: { gt: now } } });
      if (!session) return "wrong-user";
      if (await tx.account.count({ where: { userId: input.userId, provider: input.provider } })) return "already-connected";
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true, email: true } });
      const emailLookup = lookupEmail(decodeUser(user).email);
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: connectChallengePrefix(input.userId) } } });
      await tx.verificationToken.create({ data: { identifier: connectChallengeIdentifier({ userId: input.userId, provider: input.provider, emailLookup, sessionDigest, stateDigest: digest("state", input.state) }), token: digest("nonce", input.nonce), expires: new Date(now.getTime() + 300_000) } });
      return "ready";
    });
  } catch { return "failed"; }
}
type Proof = { nonce: string; sessionToken: string; state: string; provider: string; providerAccountId: string; verifiedEmail: string | null };
export async function finishConnect(prisma: PrismaClient, input: Proof): Promise<ConnectOutcome> {
  if (!validNonce(input.nonce)) return "expired";
  if (!input.sessionToken) return "wrong-user";
  if (!input.state || !isLoginProvider(input.provider) || !input.providerAccountId) return "failed";
  try {
    return await prisma.$transaction(async tx => {
      // The purpose-bound nonce lookup discovers the owner; all later reads and consumption bind that owner.
      const row = await tx.verificationToken.findFirst({ where: { token: digest("nonce", input.nonce), identifier: { startsWith: connectChallengePrefix() } } });
      const c = row && parseConnectChallenge(row.identifier);
      if (!row || !c || !await lockUser(tx, c.userId)) return "expired";
      // Another callback or start can consume/replace this challenge while we wait for the owner lock.
      const current = await tx.verificationToken.findUnique({ where: { identifier_token: { identifier: row.identifier, token: row.token } } });
      if (!current) return "expired";
      const now = new Date();
      const session = await tx.session.findFirst({ where: { userId: c.userId, sessionToken: hashSessionToken(input.sessionToken), expires: { gt: now } } });
      // Ownership lookup is deliberately cross-user: reject before any account write.
      const existing = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } }, select: { userId: true } });
      const decision = planLoginMethodLink({ challenge: { ...c, expires: current.expires }, sessionUserId: session?.userId ?? null, provider: input.provider,
        providerLookup: input.verifiedEmail ? lookupEmail(input.verifiedEmail) : null, existing, state: digest("state", input.state), sessionToken: hashSessionToken(input.sessionToken), now });
      if (decision !== "connected") return decision;
      const user = await tx.user.findUniqueOrThrow({ where: { id: c.userId }, select: { id: true, email: true } });
      if (lookupEmail(decodeUser(user).email) !== c.emailLookup) return "email-mismatch";
      if (await tx.account.count({ where: { userId: c.userId, provider: c.provider } })) return "already-connected";
      const consumed = await tx.verificationToken.deleteMany({ where: { identifier: row.identifier, token: row.token, expires: { equals: row.expires, gt: now } } });
      if (consumed.count !== 1) return "expired";
      await tx.account.create({ data: { userId: c.userId, type: "oauth", provider: c.provider, providerAccountId: input.providerAccountId } });
      return "connected";
    });
  } catch (error) {
    // Re-query outside the aborted transaction; a uniqueness race must never transfer ownership.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      try {
        const session = await prisma.session.findFirst({ where: { sessionToken: hashSessionToken(input.sessionToken), expires: { gt: new Date() } }, select: { userId: true } });
        const existing = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: input.provider, providerAccountId: input.providerAccountId } }, select: { userId: true } });
        if (session && existing) return existing.userId === session.userId ? "already-connected" : "taken-by-other";
      } catch { /* Only fixed outcomes leave this boundary. */ }
    }
    return "failed";
  }
}
