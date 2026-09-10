import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { credentialCommand, credentialTarget } from "../lib/credentials/command";
import { convertCredentials } from "../lib/credentials/conversion";
import { CredentialError } from "../lib/credentials/crypto";
import { FINALIZE_MIGRATION, finalizationPending } from "../lib/credentials/finalize";
config({ path: ".env.local", quiet: true });
let prisma: PrismaClient | undefined;
try {
  const options = credentialCommand(process.argv.slice(2));
  if (options.mode !== "backfill") throw new CredentialError();
  const { target, url } = credentialTarget(process.env);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [] });
  await convertCredentials(prisma, { mode: "verify" });
  const sql = (name: string, folder = "migrations") => readFileSync(join("prisma", folder, name, "migration.sql"));
  if (!sql(FINALIZE_MIGRATION).equals(sql(FINALIZE_MIGRATION, "credential-cutover"))) throw new CredentialError();
  const files = readdirSync("prisma/migrations").filter(n => n !== "migration_lock.toml").map(name => ({ name, checksum: createHash("sha256").update(sql(name)).digest("hex") }));
  const history = await prisma.$queryRaw<{ name: string; checksum: string; finished: boolean; rolledBack: boolean }[]>`SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations"`;
  const pending = finalizationPending(files, history, FINALIZE_MIGRATION);
  if (options.apply && pending) {
    // Keep Prisma's history/checksums authoritative. Never mark a migration applied ourselves.
    execFileSync("pnpm", target === "prod" ? ["db:deploy"] : ["exec", "prisma", "migrate", "deploy"], {
      stdio: "pipe", env: { ...process.env, PRISMA_TARGET: target === "prod" ? "prod" : "dev" },
    });
    await convertCredentials(prisma, { mode: "verify" });
  }
  console.log(JSON.stringify({ target, pending, applied: Boolean(options.apply && pending) }));
} catch {
  console.error("credential-finalization-failed: keep traffic blocked; inspect migration status before recovery");
  process.exitCode = 1;
} finally {
  try { await prisma?.$disconnect(); } catch { process.exitCode = 1; }
}
