import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { refreshVerifiedEmail } from "@/lib/credentials/access";
import { encodeUserFields, decodeUser } from "@/lib/credentials/records";

// Dedicated socket-only database; no application credentials or external services.
const directory = mkdtempSync(join(tmpdir(), "malmoi-security-audit-"));
const binaries = process.env.CREDENTIAL_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
let pool: Pool;
let prisma: PrismaClient;
let started = false;
beforeAll(async () => {
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p 55489 -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: 55489, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
});
beforeEach(async () => {
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  const fields = encodeUserFields("audit-user", { email: "original@example.test" });
  if (fields.email === undefined) throw new Error("fixture email missing");
  await prisma.user.create({ data: { id: "audit-user", ...fields, email: fields.email } });
  await prisma.account.create({ data: { userId: "audit-user", type: "oauth", provider: "github", providerAccountId: "audit-gh" } });
});
afterAll(async () => {
  await prisma?.$disconnect(); await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});
it("control: a still-linked single provider may refresh verified email", async () => {
  expect(await refreshVerifiedEmail(prisma, "github", "audit-gh", "fresh@example.test")).toBe("update");
  expect(decodeUser(await prisma.user.findUniqueOrThrow({ where: { id: "audit-user" } })).email).toBe("fresh@example.test");
});
it("control: an already-unlinked provider cannot refresh email", async () => {
  await prisma.account.deleteMany();
  expect(await refreshVerifiedEmail(prisma, "github", "audit-gh", "fresh@example.test")).toBe("unlinked");
  expect(decodeUser(await prisma.user.findUniqueOrThrow({ where: { id: "audit-user" } })).email).toBe("original@example.test");
});
it("security regression: unlink committed after Account lookup must prevent email mutation", async () => {
  await prisma.account.create({ data: { userId: "audit-user", type: "oauth", provider: "google", providerAccountId: "audit-google" } });
  // Pause after a real Account SELECT, then commit unlink before refresh acquires User lock.
  // This controls ordering only; all reads, locks, deletes and email writes use real PostgreSQL.
  let signalRead!: () => void;
  let resumeRead!: () => void;
  const read = new Promise<void>(resolve => { signalRead = resolve; });
  const resume = new Promise<void>(resolve => { resumeRead = resolve; });
  const intercepted = prisma.$extends({ query: { account: {
    async findUnique({ args, query }) {
      const value = await query(args);
      signalRead();
      await resume;
      return value;
    },
  } } });
  // Extension keeps real queries/transactions; the production signature requires the unextended type.
  const callback = refreshVerifiedEmail(intercepted as unknown as PrismaClient, "github", "audit-gh", "revoked-provider@example.test");
  try {
    await read;
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${"audit-user"} FOR UPDATE`;
      await tx.account.deleteMany({ where: { userId: "audit-user", provider: "github" } });
    });
    resumeRead();
    await callback;
    expect(await prisma.account.count({ where: { provider: "github" } })).toBe(0);
    expect(decodeUser(await prisma.user.findUniqueOrThrow({ where: { id: "audit-user" } })).email).toBe("original@example.test");
  } finally { resumeRead(); }
});
