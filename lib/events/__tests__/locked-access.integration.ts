import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { detectFormat } from "@/lib/adapters";
import { encodeInvitationEmail } from "@/lib/credentials/records";
import { optionalEnv } from "@/lib/env";

/**
 * **잠금 대기 중 바뀐 권한·보관으로 쓰지 않는다** (감사 #9·#10·#26 — ARCHITECTURE §5.6.4 · POSTMORTEM 2026-09-23).
 *
 * 진입점 인가는 잠금 전 1회다. 별도 연결이 `Project` 잠금을 쥔 채 멤버 제거·강등·보관을 하고, 쓰기가 **실제로 잠금을
 * 기다리는 것을 관측한 뒤** 커밋한다 — 타이머로 순서를 흉내내면 잠금 전 상태를 읽는 회귀를 못 잡는다.
 * ⚠️ 거부 단언마다 같은 픽스처의 성공 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const h = vi.hoisted(() => ({ userId: "", prisma: undefined as unknown, put: vi.fn(), del: vi.fn(), normalize: vi.fn(), pull: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: h.userId } }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/upload/store", () => ({ putImage: h.put, deleteImage: h.del }));
vi.mock("@/lib/upload/normalize", () => ({ normalizeImage: h.normalize }));
vi.mock("@/lib/pull/trigger", () => ({ triggerPull: h.pull }));

const projects = await import("@/app/(edit)/projects/actions");
const settings = await import("@/app/(edit)/projects/[slug]/settings/actions");
const sources = await import("@/app/(edit)/projects/[slug]/sources/actions");
const { applyKeySave } = await import("@/lib/keys/save-key");
const { issueInvitations } = await import("@/lib/invitation-email/issue");
const { runSync } = await import("@/lib/sync/run");
const { ingestFirstSnapshot } = await import("@/lib/onboarding/ingest");

const directory = mkdtempSync(join(tmpdir(), "malmoi-locked-access-"));
let binaries: string;
const PORT = 55530;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
  h.prisma = prisma;
});

const OLD_IMAGE = "https://store.public.blob.vercel-storage.com/projects/p/old.webp";
const NEW_IMAGE = "https://store.public.blob.vercel-storage.com/projects/p/new.webp";

beforeEach(async () => {
  vi.clearAllMocks();
  h.put.mockResolvedValue(NEW_IMAGE);
  h.normalize.mockResolvedValue({ ok: true, bytes: Uint8Array.of(1) });
  h.pull.mockRejectedValue(new Error("fixture"));
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  for (const id of ["a", "b", "c", "editor"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
  await prisma.project.create({ data: { id: "p", slug: "p", name: "Before", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "100", pushTokenHash: "old-hash", image: OLD_IMAGE } });
  await prisma.projectMember.createMany({ data: [
    ...["a", "b", "c"].map(userId => ({ projectId: "p", userId, role: "OWNER" as const })),
    { projectId: "p", userId: "editor", role: "EDITOR" as const },
  ] });
  await prisma.translationSurface.create({ data: { id: "s", projectId: "p", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "c1" } });
  await prisma.locale.createMany({ data: ["en", "ko"].map(code => ({ projectId: "p", surfaceId: "s", code, name: code, isBase: code === "en" })) });
  await prisma.stringKey.create({ data: { id: "k1", projectId: "p", surfaceId: "s", key: "greet", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
  await prisma.translation.create({ data: { id: "k1-ko", projectId: "p", surfaceId: "s", keyId: "k1", localeCode: "ko", value: "안녕" } });
  await prisma.projectInvitation.create({ data: { id: "inv", projectId: "p", ...encodeInvitationEmail("inv", "p", "invitee@x.com"), role: "EDITOR", tokenHash: "t", expiresAt: new Date(Date.now() + 86_400_000), invitedBy: "a" } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

type Change = "removed" | "demoted" | "archived";
const CHANGE_SQL: Record<Change, (userId: string) => [string, unknown[]]> = {
  removed: userId => ['DELETE FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2', ["p", userId]],
  demoted: userId => [`UPDATE "ProjectMember" SET "role" = 'EDITOR' WHERE "projectId" = $1 AND "userId" = $2`, ["p", userId]],
  archived: () => ['UPDATE "Project" SET "archivedAt" = now() WHERE "id" = $1', ["p"]],
};

/** 다른 연결이 `Project` 잠금을 쥔 채 `change`를 하고, `run`이 잠금을 기다리는 것을 본 뒤 커밋한다. */
async function race<T>(change: Change, userId: string, run: () => Promise<T>): Promise<T> {
  const blocker = await pool.connect();
  let pending: Promise<T> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query('SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE', ["p"]);
    const [sql, values] = CHANGE_SQL[change](userId);
    await blocker.query(sql, values);
    h.userId = userId;
    pending = run();
    pending.catch(() => undefined);
    await expect.poll(async () => (await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> $1", [(blocker as unknown as { processID: number }).processID])).rows[0].n, { timeout: 10_000 }).toBeGreaterThan(0);
    await blocker.query("COMMIT");
    return await pending;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pending?.catch(() => undefined);
  }
}

const project = () => prisma.project.findUniqueOrThrow({ where: { id: "p" } });
const eventCount = () => prisma.projectEvent.count({ where: { projectId: "p" } });

describe("멤버 관리 (member:manage)", () => {
  it("감사 시나리오: A가 B를 제거한 뒤 B의 C 제거는 권한 없이 커밋되지 않는다", async () => {
    expect(await race("removed", "b", () => projects.changeMember({ slug: "p", targetUserId: "c", nextRole: null }))).toEqual({ ok: false, error: "not-found" });
    expect(await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: "p", userId: "c" } } })).toMatchObject({ role: "OWNER" });
    // 대조: 같은 픽스처에서 권한이 남은 A는 C를 제거한다.
    h.userId = "a";
    expect(await projects.changeMember({ slug: "p", targetUserId: "c", nextRole: null })).toEqual({ ok: true });
  });

  it("강등된 OWNER는 초대를 무효화하지 못한다", async () => {
    expect(await race("demoted", "a", () => projects.revokeInvitation({ slug: "p", invitationId: "inv" }))).toEqual({ ok: false, error: "forbidden" });
    expect((await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "inv" } })).expiresAt.getTime()).toBeGreaterThan(Date.now());
    h.userId = "b";
    expect(await projects.revokeInvitation({ slug: "p", invitationId: "inv" })).toEqual({ ok: true });
  });

  it("강등된 OWNER는 초대를 발급하지 못한다", async () => {
    const issue = () => issueInvitations(prisma, { projectId: "p", userId: "a", recipients: [{ email: "new@x.com", role: "EDITOR" }] });
    expect(await race("demoted", "a", issue)).toEqual({ status: "forbidden" });
    expect(await prisma.projectInvitation.count({ where: { projectId: "p" } })).toBe(1);
  });
});

describe("설정 쓰기 (project:settings)", () => {
  it.each(["demoted", "archived"] as const)("%s이면 이름이 안 바뀐다", async change => {
    expect(await race(change, "a", () => settings.updateProjectName({ slug: "p", name: "After" }))).toEqual({ ok: false, error: change === "archived" ? "archived" : "forbidden" });
    expect((await project()).name).toBe("Before");
    expect(await eventCount()).toBe(0);
  });

  it("대조: 경합이 없으면 이름이 바뀐다", async () => {
    h.userId = "a";
    expect(await settings.updateProjectName({ slug: "p", name: "After" })).toEqual({ ok: true, name: "After" });
    expect(await eventCount()).toBe(1);
  });

  it("강등되면 push 토큰이 회전되지 않는다 — 잠금이 없던 자리다", async () => {
    expect(await race("demoted", "a", () => projects.rotatePushToken({ slug: "p" }))).toEqual({ ok: false, error: "forbidden" });
    expect((await project()).pushTokenHash).toBe("old-hash");
    h.userId = "b";
    expect((await projects.rotatePushToken({ slug: "p" })).ok).toBe(true);
    expect((await project()).pushTokenHash).not.toBe("old-hash");
  });

  it("보관되면 기준 브랜치가 안 바뀐다", async () => {
    expect(await race("archived", "a", () => settings.updateRepositorySettings({ slug: "p", baseBranch: "next" }))).toEqual({ ok: false, error: "archived" });
    expect((await project()).baseBranch).toBe("main");
  });

  it("제거되면 기준 로케일 선언이 안 바뀐다", async () => {
    expect(await race("removed", "a", () => sources.updateBaseLocale({ slug: "p", surfaceSlug: "default", baseLocale: "ko" }))).toEqual({ ok: false, error: "not-found" });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).declaredBaseLocale).toBeNull();
    h.userId = "b";
    expect(await sources.updateBaseLocale({ slug: "p", surfaceSlug: "default", baseLocale: "ko" })).toEqual({ ok: true });
  });

  it("보관되면 이미지를 바꾸지 않고 방금 올린 객체를 회수한다", async () => {
    const form = new FormData(); form.set("slug", "p"); form.set("image", new File(["png"], "p.png", { type: "image/png" }));
    expect(await race("archived", "a", () => settings.uploadProjectImage(form))).toEqual({ ok: false, reason: "archived" });
    expect((await project()).image).toBe(OLD_IMAGE);
    expect(h.del).toHaveBeenCalledWith("projects/p/new.webp");
    expect(h.del).not.toHaveBeenCalledWith("projects/p/old.webp");
  });

  it("강등되면 이미지를 지우지 않는다", async () => {
    expect(await race("demoted", "a", () => settings.deleteProjectImage("p"))).toEqual({ ok: false, reason: "forbidden" });
    expect((await project()).image).toBe(OLD_IMAGE);
    expect(h.del).not.toHaveBeenCalled();
  });

  it("강등되면 보관하지 못하고, 제거되면 복원하지 못한다", async () => {
    expect(await race("demoted", "a", () => projects.archiveProject("p"))).toEqual({ ok: false, error: "forbidden" });
    expect((await project()).archivedAt).toBeNull();
    h.userId = "b";
    expect(await projects.archiveProject("p")).toEqual({ ok: true });
    expect(await race("removed", "b", () => projects.unarchiveProject("p"))).toEqual({ ok: false, error: "not-found" });
    expect((await project()).archivedAt).not.toBeNull();
  });

  it("강등되면 첫 적재가 키를 쓰지 않는다", async () => {
    await prisma.translationSurface.create({ data: { id: "s2", projectId: "p", slug: "second", adapterName: "json-catalog", pathTemplate: "l/{locale}.json", nested: false, baseLocale: "en" } });
    const tree: Record<string, string> = { "l/en.json": '{\n  "hi": "Hi"\n}\n', "l/ko.json": '{\n  "hi": "안녕"\n}\n' };
    const paths = Object.keys(tree);
    const format = detectFormat(paths, p => tree[p]);
    if (!format) throw new Error("fixture not detected");
    const ingest = (userId: string) => ingestFirstSnapshot(prisma, {
      projectId: "p", surfaceId: "s2", surfaceSlug: "second", projectSlug: "p", userId,
      token: "t", startedAt: new Date(), format, baseLocale: "en", headSha: "d".repeat(40), headCommittedAt: new Date().toISOString(),
      paths, targets: paths, blobs: new Map(Object.entries(tree)),
    });
    await expect(race("demoted", "a", () => ingest("a"))).rejects.toMatchObject({ code: "forbidden" });
    expect(await prisma.stringKey.count({ where: { surfaceId: "s2" } })).toBe(0);
    expect((await ingest("b")).count).toBe(1);
  });
});

describe("번역 쓰기 (translation:write)", () => {
  const save = () => applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId: "k1", userId: "editor", changes: [{ localeCode: "ko", value: "새 값" }] });

  it.each(["removed", "archived"] as const)("%s이면 저장과 사건이 커밋되지 않는다", async change => {
    expect(await race(change, "editor", save)).toEqual({ ok: false, error: change === "archived" ? "archived" : "not-found" });
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "k1-ko" } })).value).toBe("안녕");
    expect(await eventCount()).toBe(0);
  });

  it("대조: 경합이 없으면 저장된다", async () => {
    expect((await save()).ok).toBe(true);
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "k1-ko" } })).value).toBe("새 값");
  });

  it("제거된 EDITOR의 수동 Publish는 실행 행을 만들지 않는다", async () => {
    const publish = () => runSync(prisma, { projectId: "p", slug: "p", trigger: "manual", requestedBy: "editor" });
    expect(await race("removed", "editor", publish)).toEqual({ status: "failed", error: "not-found", delivery: "not-started", retryable: false });
    expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(0);
    expect(h.pull).not.toHaveBeenCalled();
    // 대조: 남은 멤버의 실행은 행을 연다.
    await runSync(prisma, { projectId: "p", slug: "p", trigger: "manual", requestedBy: "a" });
    expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(1);
  });
});
