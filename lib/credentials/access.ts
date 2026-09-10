import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { planEmailRefresh, type EmailRefresh } from "@/lib/auth/email";
import { CredentialError } from "./crypto";
import { decodeUser, encodeUserFields, verifyLookupEmail } from "./records";
import { lookupEmail } from "./storage";

type Client = PrismaClient | Prisma.TransactionClient;
/** Never let Prisma arguments or crypto inputs escape in an exception. */
export async function credentialIO<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch { throw new CredentialError(); }
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
export async function refreshVerifiedEmail(prisma: PrismaClient, provider: string, providerAccountId: string, fresh: string | null): Promise<EmailRefresh> {
  if (fresh === null) return "keep";
  try {
    const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, select: { userId: true } });
    if (linked === null) return "keep";
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${linked.userId} FOR UPDATE`;
      const row = await tx.user.findUnique({ where: { id: linked.userId }, select: { id: true, email: true, emailLookup: true } });
      if (row === null) throw new CredentialError();
      const user = decodeUser(row);
      const taken = await findUserByEmail(tx, fresh);
      const plan = planEmailRefresh({ stored: user.email, fresh, takenByOther: taken !== null && taken.id !== user.id });
      if (plan === "update") await tx.user.update({ where: { id: user.id }, data: encodeUserFields(user.id, { email: fresh }) });
      return plan;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return "conflict";
    throw new CredentialError();
  }
}
