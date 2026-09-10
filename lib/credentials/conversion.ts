import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { credentialIO } from "./access";
import { CredentialError } from "./crypto";
import { assertUniqueEmails, isHashedSession, planCredentialMigration, planPersonalFields, type MigrationMode } from "./migration";
import { validateCredentialKeys } from "./storage";
export type ConversionOptions = { mode: MigrationMode; apply?: boolean; trafficBlocked?: boolean; writersDrained?: boolean };
type ConversionReport = { users: number; invitations: number; accounts: number; sessions: number; loginAccounts: number; appAccounts: number; oldPiiKey: number; oldTokenKey: number; changes: number; applied: number };
export async function convertCredentials(prisma: PrismaClient, options: ConversionOptions): Promise<ConversionReport> {
  return credentialIO(async () => {
    validateCredentialKeys();
    if (options.apply && (!options.trafficBlocked || !options.writersDrained || options.mode === "verify")) throw new CredentialError();
    const [users, invitations, accounts, sessions] = await Promise.all([
      prisma.user.findMany(), prisma.projectInvitation.findMany(), prisma.account.findMany(), prisma.session.findMany(),
    ]);
    assertUniqueEmails(users);
    const owners = new Set<string>();
    for (const row of accounts.filter(a => a.provider === "github-app")) {
      if (owners.has(row.userId)) throw new CredentialError();
      owners.add(row.userId);
    }
    // Build and validate the entire plan before the first write. Each CAS statement is one resumable batch.
    const writes: (() => Promise<{ count: number }>)[] = [];
    for (const row of users) {
      const data = planPersonalFields(row, "User", options.mode);
      if (data) writes.push(() => prisma.user.updateMany({ where: { id: row.id, email: row.email, emailLookup: row.emailLookup, name: row.name, image: row.image }, data }));
    }
    for (const row of invitations) {
      const data = planPersonalFields(row, "ProjectInvitation", options.mode);
      if (data) writes.push(() => prisma.projectInvitation.updateMany({ where: { id: row.id, projectId: row.projectId, email: row.email, emailLookup: row.emailLookup }, data: { email: data.email, emailLookup: data.emailLookup } }));
    }
    for (const row of accounts) {
      const data = planCredentialMigration(row, options.mode);
      if (data) writes.push(() => prisma.account.updateMany({ where: { provider: row.provider, providerAccountId: row.providerAccountId, userId: row.userId, access_token: row.access_token, refresh_token: row.refresh_token, id_token: row.id_token, expires_at: row.expires_at }, data }));
    }
    for (const row of sessions) {
      if (isHashedSession(row.sessionToken)) continue;
      if (options.mode !== "backfill") throw new CredentialError();
      writes.push(() => prisma.session.deleteMany({ where: { sessionToken: row.sessionToken, userId: row.userId, expires: row.expires } }));
    }
    let applied = 0;
    if (options.apply) {
      for (const write of writes) {
        if ((await write()).count !== 1) throw new CredentialError();
        applied++;
      }
      // A surviving old writer or a partial rotation must never be reported as ready to resume.
      const verified = await convertCredentials(prisma, { mode: "verify" });
      if ((options.mode === "rotate-token" && verified.oldTokenKey !== 0) || (options.mode === "rotate-pii" && verified.oldPiiKey !== 0)) throw new CredentialError();
      return { ...verified, changes: writes.length, applied };
    }
    const oldKey = (value: string | null | undefined, kind: "PII" | "TOKEN") => typeof value === "string" && value.startsWith("enc:") && value.split(":")[2] !== process.env[`${kind}_ENCRYPTION_ACTIVE_KEY_ID`];
    return { users: users.length, invitations: invitations.length, accounts: accounts.length, sessions: sessions.length,
      loginAccounts: accounts.filter(a => a.provider === "github" || a.provider === "google").length,
      appAccounts: owners.size,
      oldPiiKey: [...users.flatMap(u => [u.email, u.name, u.image]), ...invitations.map(i => i.email)].filter(v => oldKey(v, "PII")).length,
      oldTokenKey: accounts.flatMap(a => [a.access_token, a.refresh_token]).filter(v => oldKey(v, "TOKEN")).length,
      changes: writes.length, applied };
  });
}
