import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/lib/env";
import { credentialIO } from "./access";
import { CredentialError } from "./crypto";
import { assertUniqueEmails, isHashedSession, migrateAccountFields, migratePersonalFields, type MigrationMode } from "./migration";
import { openGitLabToken, sealGitLabToken, validateCredentialKeys } from "./storage";
export type ConversionOptions = { mode: MigrationMode; apply?: boolean; trafficBlocked?: boolean; writersDrained?: boolean };
type ConversionReport = { users: number; invitations: number; accounts: number; sessions: number; loginAccounts: number; appAccounts: number; oldPiiKey: number; oldTokenKey: number; changes: number; applied: number };
export async function convertCredentials(prisma: PrismaClient, options: ConversionOptions): Promise<ConversionReport> {
  return credentialIO(async () => {
    validateCredentialKeys();
    if (options.apply && (!options.trafficBlocked || !options.writersDrained || options.mode === "verify")) throw new CredentialError();
    const [users, invitations, accounts, sessions, gitlabConnections] = await Promise.all([
      prisma.user.findMany(), prisma.projectInvitation.findMany(), prisma.account.findMany(), prisma.session.findMany(), prisma.gitLabConnection.findMany(),
    ]);
    assertUniqueEmails(users);
    const owners = new Set<string>();
    for (const row of accounts.filter(a => a.provider === "github-app")) {
      if (owners.has(row.userId)) throw new CredentialError();
      owners.add(row.userId);
    }
    // 첫 쓰기 전에 계획 전체를 만들고 검증한다. CAS 문장 하나가 재개 가능한 배치 하나다.
    const writes: (() => Promise<{ count: number }>)[] = [];
    for (const row of users) {
      const data = migratePersonalFields(row, "User", options.mode);
      if (data) writes.push(() => prisma.user.updateMany({ where: { id: row.id, email: row.email, emailLookup: row.emailLookup, name: row.name, image: row.image }, data }));
    }
    for (const row of invitations) {
      const data = migratePersonalFields(row, "ProjectInvitation", options.mode);
      if (data) writes.push(() => prisma.projectInvitation.updateMany({ where: { id: row.id, projectId: row.projectId, email: row.email, emailLookup: row.emailLookup }, data: { email: data.email, emailLookup: data.emailLookup } }));
    }
    for (const row of accounts) {
      const data = migrateAccountFields(row, options.mode);
      if (data) writes.push(() => prisma.account.updateMany({ where: { provider: row.provider, providerAccountId: row.providerAccountId, userId: row.userId, access_token: row.access_token, refresh_token: row.refresh_token, expires_at: row.expires_at }, data }));
    }
    // PAT는 처음부터 봉투만 저장한다 — backfill도 평문을 받아들이지 않는다. 모든 모드에서 AAD·키를 검증한다.
    for (const row of gitlabConnections) {
      const ctx = { userId: row.userId };
      const plain = openGitLabToken(row.token, ctx);
      if (options.mode === "rotate-token" && row.token.split(":")[2] !== requireEnv("TOKEN_ENCRYPTION_ACTIVE_KEY_ID")) {
        const token = sealGitLabToken(plain, ctx);
        writes.push(() => prisma.gitLabConnection.updateMany({ where: { id: row.id, userId: row.userId, token: row.token }, data: { token } }));
      }
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
      // 살아남은 옛 writer나 부분 회전을 재개 가능으로 보고하면 안 된다.
      const verified = await convertCredentials(prisma, { mode: "verify" });
      if ((options.mode === "rotate-token" && verified.oldTokenKey !== 0) || (options.mode === "rotate-pii" && verified.oldPiiKey !== 0)) throw new CredentialError();
      return { ...verified, changes: writes.length, applied };
    }
    const oldKey = (value: string | null | undefined, kind: "PII" | "TOKEN") => typeof value === "string" && value.startsWith("enc:") && value.split(":")[2] !== requireEnv(`${kind}_ENCRYPTION_ACTIVE_KEY_ID`);
    return { users: users.length, invitations: invitations.length, accounts: accounts.length, sessions: sessions.length,
      loginAccounts: accounts.filter(a => a.provider === "github" || a.provider === "google").length,
      appAccounts: owners.size,
      oldPiiKey: [...users.flatMap(u => [u.email, u.name, u.image]), ...invitations.map(i => i.email)].filter(v => oldKey(v, "PII")).length,
      oldTokenKey: [...accounts.flatMap(a => [a.access_token, a.refresh_token]), ...gitlabConnections.map(c => c.token)].filter(v => oldKey(v, "TOKEN")).length,
      changes: writes.length, applied };
  });
}
