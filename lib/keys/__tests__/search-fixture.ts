import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/** 두 검색 스위트가 같은 격리·통계 조건을 쓴다. TCP를 열지 않아 다른 워커와 포트가 충돌하지 않는다. */
export function searchFixture() {
  const directory = mkdtempSync(join(tmpdir(), "malmoi-search-"));
  const binaries = process.env.CREDENTIAL_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const config = { host: directory, port: 55525, user: "postgres", database: "postgres", options: "-c statement_timeout=5000" };
  const pool = new Pool(config);
  const prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [{ emit: "event", level: "query" }] });
  const captured: { query: string; params: string }[] = [];
  (prisma as unknown as { $on(event: "query", cb: (e: { query: string; params: string }) => void): void }).$on("query", e => captured.push(e));
  let started = false;
  return {
    pool, prisma, captured,
    async start() {
      execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
      execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p 55525 -F -c autovacuum=off`, "-w", "start"], { stdio: "pipe" });
      started = true;
    },
    async reset() {
      await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
      for (const name of readdirSync("prisma/migrations").sort()) {
        if (name !== "migration_lock.toml") await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
      }
      for (const id of ["u1", "u2", "empty"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
    },
    async stop() {
      await prisma.$disconnect();
      await pool.end();
      if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
      rmSync(directory, { recursive: true, force: true });
    },
    async project(id: string, userId = "u1") {
      await prisma.project.create({ data: { id, slug: id, name: id, repoOwner: "o", repoName: id, baseBranch: "main", installationId: "1" } });
      await prisma.projectMember.create({ data: { projectId: id, userId, role: "EDITOR" } });
    },
    async surface(projectId: string, id: string, codes = ["en", "ko"]) {
      await prisma.translationSurface.create({ data: { id, projectId, slug: id, adapterName: "json-catalog", pathTemplate: `${id}/{locale}.json`, nested: false, baseLocale: "en", lastCommitSha: "c1" } });
      await prisma.locale.createMany({ data: codes.map(code => ({ projectId, surfaceId: id, code, name: code, isBase: code === "en" })) });
    },
    async key(projectId: string, surfaceId: string, id: string, key: string, sourceText = "Source", values: Record<string, string> = {}) {
      await prisma.stringKey.create({ data: { id, projectId, surfaceId, key, namespace: "_root", sourceText, sourceHash: id } });
      await prisma.translation.createMany({ data: Object.entries(values).map(([localeCode, value]) => ({ id: `${id}-${localeCode}`, projectId, surfaceId, keyId: id, localeCode, value })) });
    },
  };
}
