import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

/** Auth.js checks expiry on session reads, but not before OAuth account linking. */
export function safePrismaAdapter(prisma: PrismaClient, now: () => Date = () => new Date()): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    async getSessionAndUser(token) {
      const result = await base.getSessionAndUser!(token);
      if (result === null) return null;
      const cutoff = now();
      if (result.session.expires.getTime() > cutoff.getTime()) return result;
      await prisma.session.deleteMany({ where: { sessionToken: token, expires: { lte: cutoff } } });
      return null;
    },
    async linkAccount(account) {
      if (account.provider !== "github" && account.provider !== "google") throw new Error("unsupported login provider");
      await prisma.$transaction(async (tx) => {
        // Serialize the first login too: two callbacks must not both see no account.
        await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${account.userId} FOR UPDATE`;
        const linked = await tx.account.findFirst({ where: { userId: account.userId, provider: { in: ["github", "google"] } }, select: { provider: true } });
        if (linked !== null) throw new Error("additional login accounts are disabled");
        await tx.account.create({ data: { userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId } });
      });
    },
  };
}
