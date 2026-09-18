import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { planEmailRefresh, type EmailRefresh } from "@/lib/auth/email";
import { CredentialError } from "./crypto";
import { decodeUser, encodeUserFields, verifyLookupEmail } from "./records";
import { logCredentialFailure } from "./log";
import { lookupEmail } from "./storage";

type Client = PrismaClient | Prisma.TransactionClient;
/** Never let Prisma arguments or crypto inputs escape in an exception. */
export async function credentialIO<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { logCredentialFailure("credential-io", error); throw new CredentialError(); }
}
export async function findUserByEmail(prisma: Client, email: string) {
  return credentialIO(async () => {
    const row = await prisma.user.findUnique({ where: { emailLookup: lookupEmail(email) }, select: { id: true, email: true, emailLookup: true } });
    if (row === null) return null;
    const user = decodeUser(row);
    verifyLookupEmail(user.email, email);
    return user;
  });
}
/**
 * ⚠️ **`"unlinked"`가 `"keep"`에서 갈라져 나왔다** (account-linking T2). 호출부(`signIn` 콜백)가
 * "이 Account가 처음 보는 것인가"를 알아야 병합 안내를 **그때만** 조회한다 — 두 상태를 같은
 * `"keep"`으로 접으면 재방문 로그인마다 이메일 조회가 한 번씩 더 돈다 (ARCHITECTURE "계정 병합").
 */
export async function refreshVerifiedEmail(prisma: PrismaClient, provider: string, providerAccountId: string, fresh: string | null): Promise<EmailRefresh | "unlinked"> {
  try {
    const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, select: { userId: true } });
    if (linked === null) return "unlinked";
    if (fresh === null) return "keep";
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${linked.userId} FOR UPDATE`;
      const row = await tx.user.findUnique({ where: { id: linked.userId }, select: { id: true, email: true, emailLookup: true } });
      if (row === null) throw new CredentialError();
      const user = decodeUser(row);
      const taken = await findUserByEmail(tx, fresh);
      // ⚠️ **수단이 둘 이상이면 주소를 옮기지 않는다** (ARCHITECTURE "계정 병합") — 병합한 계정에서
      // `User.email`이 로그인한 provider에 따라 뒤집히면 초대 대조가 그 위에서 흔들린다.
      const loginMethods = await tx.account.count({ where: { userId: user.id, provider: { in: ["github", "google"] } } });
      const plan = planEmailRefresh({ stored: user.email, fresh, takenByOther: taken !== null && taken.id !== user.id, loginMethods });
      if (plan === "update") await tx.user.update({ where: { id: user.id }, data: encodeUserFields(user.id, { email: fresh }) });
      return plan;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return "conflict";
    logCredentialFailure("refresh-email", error);
    throw new CredentialError();
  }
}
