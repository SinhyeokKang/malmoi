import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { loadAttentionBadgeAction, openAttentionInboxAction } from "@/app/(edit)/inbox/actions";
import { loadAttentionInbox } from "../load";
import { attentionHref } from "@/lib/home/attention-view";

const session = vi.hoisted(() => ({ userId: "u1" }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "ok", userId: session.userId }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => prisma }));

// 공유 DB 자격증명 없이 Unix 소켓의 폐기용 클러스터만 쓴다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-inbox-"));
const PORT = 55606;
let binaries: string, pool: Pool, prisma: PrismaClient;
let started = false;
const early = new Date("2026-10-01T00:00:00Z");
const future = new Date("2099-01-01T00:00:00Z");
beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});
beforeEach(async () => {
  session.userId = "u1";
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name !== "migration_lock.toml") await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.createMany({ data: [{ id: "u1", email: "fixture-1" }, { id: "u2", email: "fixture-2" }] });
});
afterAll(async () => {
  await prisma?.$disconnect(); await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});
async function project(id: string, options: { userId?: string; archived?: boolean; setup?: boolean; role?: "OWNER" | "EDITOR" } = {}) {
  await prisma.project.create({ data: { id, slug: id, name: id, repoOwner: "o", repoName: "r", createdAt: early,
    installationId: options.setup ? null : "123", repositoryId: "123", archivedAt: options.archived ? early : null,
    members: { create: { userId: options.userId ?? "u1", role: options.role ?? "OWNER" } },
  } });
  if (options.setup) return;
  await prisma.translationSurface.create({ data: { id: `s-${id}`, projectId: id, slug: "web", lastCommitSha: "a".repeat(40) } });
  await prisma.locale.createMany({ data: ["en", "ko"].map(code => ({ projectId: id, surfaceId: `s-${id}`, code, name: code, isBase: code === "en", createdAt: early })) });
  await prisma.stringKey.create({ data: { id: `k-${id}`, projectId: id, surfaceId: `s-${id}`, key: "hello", namespace: "_root", sourceText: "Hello", sourceHash: "hash" } });
  await prisma.translation.createMany({ data: ["en", "ko"].map(code => ({ projectId: id, surfaceId: `s-${id}`, keyId: `k-${id}`, localeCode: code, value: "Hello", updatedBy: null, updatedAt: early })) });
}
it("Action에서 모든 종류를 읽고 닫기 뒤 다음 배지는 0, 새 일은 다시 unread다", async () => {
  await project("p");
  await project("setup", { setup: true });
  await prisma.translationSurface.update({ where: { id: "s-p" }, data: { lastImportError: "partial-import", lastImportFailedAt: early } });
  await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-p", code: "es", name: "Spanish", createdAt: early } });
  await prisma.translation.updateMany({ where: { projectId: "p", localeCode: "ko" }, data: { needsReview: true, pendingEditToken: "edit", updatedAt: early } });
  expect(await loadAttentionBadgeAction()).toEqual({ status: "ok", unread: 4 });
  const opened = await openAttentionInboxAction();
  expect(opened.status).toBe("ok");
  if (opened.status !== "ok") throw new Error("Inbox failed");
  expect(opened.marked).toBe(true);
  expect(opened.plan.unread).toBe(4);
  const items = opened.plan.groups.flatMap(group => group.items);
  expect(items.map(item => item.kind).sort()).toEqual(["import_failed", "never_filled", "review", "setup", "unsent"]);
  expect(items.find(item => item.kind === "review")?.unread).toBe(false);
  const unsent = items.find(item => item.kind === "unsent")!;
  expect(attentionHref("p", unsent)).toBe("/projects/p/surfaces/web/translations?ns=*&state=unsent");
  expect(await loadAttentionBadgeAction()).toEqual({ status: "ok", unread: 0 });
  await prisma.translation.updateMany({ where: { projectId: "p", pendingEditToken: { not: null } }, data: { updatedAt: future } });
  const next = await openAttentionInboxAction();
  expect(next).toMatchObject({ status: "ok", marked: true, plan: { unread: 1 } });
  expect((await loadAttentionInbox(prisma, "u1")).unread).toBe(1);
  await prisma.translation.updateMany({ where: { projectId: "p" }, data: { pendingEditToken: null } });
  expect((await loadAttentionInbox(prisma, "u1")).groups.flatMap(group => group.items).some(item => item.kind === "unsent")).toBe(false);
});
it("보관·다른 사용자는 SQL에서 빠지고 EDITOR는 설정을 못 본다", async () => {
  await project("archived", { archived: true, setup: true });
  await project("other", { userId: "u2", setup: true });
  await project("editor", { role: "EDITOR", setup: true });
  expect(await loadAttentionBadgeAction()).toEqual({ status: "ok", unread: 0 });
  expect(await openAttentionInboxAction()).toMatchObject({ status: "ok", plan: { groups: [], unread: 0 } });
  session.userId = "u2";
  expect((await loadAttentionInbox(prisma, "u2")).groups.map(group => group.project.slug)).toEqual(["other"]);
});
it("더 늦은 다른 탭의 워터마크를 Action이 되돌리지 않는다", async () => {
  await project("p", { setup: true });
  await prisma.user.update({ where: { id: "u1" }, data: { attentionSeenAt: future } });
  expect(await openAttentionInboxAction()).toMatchObject({ status: "ok", marked: true, plan: { unread: 0 } });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: "u1" } })).attentionSeenAt).toEqual(future);
  expect(await loadAttentionBadgeAction()).toEqual({ status: "ok", unread: 0 });
});
it("표면 하나가 동기화 중이어도 다른 실패와 EDITOR 안내는 남는다", async () => {
  await project("p", { role: "EDITOR" });
  await prisma.translationSurface.update({ where: { id: "s-p" }, data: { lastImportError: "parse-failed", lastImportFailedAt: early } });
  await prisma.translationSurface.create({ data: { projectId: "p", slug: "mail", lastImportError: "parse-failed", lastImportStartedAt: early } });
  const result = await openAttentionInboxAction();
  expect(result).toMatchObject({ status: "ok", plan: { unread: 1, groups: [{ items: [{ kind: "import_failed", surfaceSlug: "web", ownerRetries: true }] }] } });
});
