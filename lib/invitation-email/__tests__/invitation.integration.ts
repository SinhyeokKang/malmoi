import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { hashInviteToken } from "@/lib/auth/invitation";
import { encodeInvitationEmail, encodeUserFields } from "@/lib/credentials/records";
import { lookupEmail } from "@/lib/credentials/storage";
import { optionalEnv } from "@/lib/env";
import { issueInvitations, reissueInvitation } from "@/lib/invitation-email/issue";
import { ADDRESS_INTERVAL_MS, INVITATION_HOURLY_LIMIT } from "@/lib/invitation-email/limits";

/**
 * **초대 발급·재발급의 실제 PostgreSQL 검증** (invitation-email T2.4 · design §3).
 *
 * - 한 대상이라도 거부면 회전·생성·사건이 0건이다. 중간 DB 실패는 전체 롤백이다.
 * - `Project` 잠금이 한도를 직렬화한다 — 마지막 자리의 동시 요청은 하나만, 같은 주소의 동시 요청도 하나만.
 * - 재발급은 대상 초대의 **조건부 회전 count=1**이 새 초대·사건의 선행조건이다 — 수락·철회와 교차해도
 *   둘 다 이기지 않는다.
 * ⚠️ "쓰지 않는다" 단언마다 같은 픽스처의 쓰는 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-invitation-email-"));
let binaries: string;
const PORT = 55521;
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
});

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  for (const [id, email] of [["u1", "owner@x.com"], ["u2", "member@x.com"], ["u3", "joiner@x.com"]] as const) {
    await prisma.user.create({ data: { id, ...encodeUserFields(id, { email, name: null }) } as never });
  }
  for (const p of ["p", "q"]) {
    await prisma.project.create({ data: { id: p, slug: p, name: p, repoOwner: "o", repoName: p, baseBranch: "main", installationId: "1", repositoryId: `r-${p}` } });
    await prisma.projectMember.create({ data: { projectId: p, userId: "u1", role: "OWNER" } });
  }
  await prisma.projectMember.create({ data: { projectId: "p", userId: "u2", role: "EDITOR" } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 7 * DAY);

async function seedInvitation(over: {
  id: string;
  email: string;
  projectId?: string;
  role?: "OWNER" | "EDITOR";
  createdAt?: Date;
  expiresAt?: Date;
  acceptedAt?: Date | null;
  token?: string;
}) {
  const projectId = over.projectId ?? "p";
  await prisma.projectInvitation.create({
    data: {
      id: over.id,
      projectId,
      ...encodeInvitationEmail(over.id, projectId, over.email),
      role: over.role ?? "EDITOR",
      tokenHash: hashInviteToken(over.token ?? `tok-${over.id}`),
      expiresAt: over.expiresAt ?? future(),
      acceptedAt: over.acceptedAt ?? null,
      invitedBy: "u1",
      createdAt: over.createdAt ?? new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });
}

/** 한 시간 창을 `n`건 채운다 — 서로 다른 주소, 전부 창 안. */
async function fillWindow(n: number) {
  for (let i = 0; i < n; i++) {
    await seedInvitation({ id: `fill-${i}`, email: `fill${i}@x.com`, createdAt: new Date(Date.now() - 30 * 60 * 1000 + i * 1000) });
  }
}

const invitations = (projectId = "p") => prisma.projectInvitation.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
const invitedEvents = (projectId = "p") => prisma.projectEvent.findMany({ where: { projectId, subtype: "member.invited" } });
const live = (email: string, projectId = "p") =>
  prisma.projectInvitation.findMany({ where: { projectId, emailLookup: lookupEmail(email, projectId), acceptedAt: null, expiresAt: { gt: new Date() } } });

/** `app/invite/actions.ts`의 수락 CAS를 그대로 옮긴 것 — 조회 시점의 만료 시각과 같아야 소비된다. */
async function acceptWithSnapshot(snapshot: { id: string; expiresAt: Date }) {
  const claimed = await prisma.projectInvitation.updateMany({
    where: { id: snapshot.id, acceptedAt: null, expiresAt: { equals: snapshot.expiresAt, gt: new Date() } },
    data: { acceptedAt: new Date() },
  });
  return claimed.count;
}

describe("issueInvitations — 정상 발급", () => {
  it("대상마다 새 초대·사건을 만들고 토큰 원문은 반환값에만 있다", async () => {
    const before = Date.now();
    const result = await issueInvitations(prisma, {
      projectId: "p",
      userId: "u1",
      recipients: [
        { email: "a@x.com", role: "EDITOR" },
        { email: "b@x.com", role: "OWNER" },
      ],
    });
    expect(result.status).toBe("issued");
    if (result.status !== "issued") return;
    expect(result.invitations.map((i) => i.email)).toEqual(["a@x.com", "b@x.com"]);

    const rows = await invitations();
    expect(rows).toHaveLength(2);
    for (const [index, row] of rows.entries()) {
      const issued = result.invitations[index];
      expect(row.tokenHash).toBe(hashInviteToken(issued?.token ?? ""));
      expect(row.invitedBy).toBe("u1");
      expect(row.acceptedAt).toBeNull();
      expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(7 * DAY);
      expect(JSON.stringify(row)).not.toContain(issued?.token ?? "__none__");
    }
    expect(rows.map((r) => r.role)).toEqual(["EDITOR", "OWNER"]);
    expect(await invitedEvents()).toHaveLength(2);
    // 방금 발급한 주소는 60초 뒤에 다시 받을 수 있다.
    expect(result.retryAt.getTime()).toBe(rows[0]!.createdAt.getTime() + ADDRESS_INTERVAL_MS);
  });

  it("미수락 기존 초대를 회전한다 — 옛 링크는 무효, 유효 링크는 하나", async () => {
    await seedInvitation({ id: "old", email: "a@x.com" });
    const result = await issueInvitations(prisma, { projectId: "p", userId: "u1", recipients: [{ email: "a@x.com", role: "OWNER" }] });
    expect(result.status).toBe("issued");
    const old = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "old" } });
    expect(old.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await live("a@x.com")).toHaveLength(1);
  });
});

describe("issueInvitations — 하나라도 거부면 전체 쓰기 0건", () => {
  it("대상 중 한 명이 이미 멤버면 그 인덱스를 돌려주고 회전·생성·사건이 없다", async () => {
    await seedInvitation({ id: "pending-a", email: "a@x.com" });
    const before = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "pending-a" } });
    const result = await issueInvitations(prisma, {
      projectId: "p",
      userId: "u1",
      recipients: [
        { email: "a@x.com", role: "EDITOR" },
        { email: "member@x.com", role: "EDITOR" },
      ],
    });
    expect(result).toEqual({ status: "invalid-rows", rowErrors: [{ index: 1, code: "already-member" }] });
    expect(await invitations()).toHaveLength(1);
    expect((await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "pending-a" } })).expiresAt).toEqual(before.expiresAt);
    expect(await invitedEvents()).toHaveLength(0);
  });

  it("다른 프로젝트의 멤버는 이 프로젝트의 멤버가 아니다 — 대조", async () => {
    const result = await issueInvitations(prisma, { projectId: "q", userId: "u1", recipients: [{ email: "member@x.com", role: "EDITOR" }] });
    expect(result.status).toBe("issued");
  });

  it("19건 상태의 3명 요청은 전체가 거부된다", async () => {
    await fillWindow(INVITATION_HOURLY_LIMIT - 1);
    const result = await issueInvitations(prisma, {
      projectId: "p",
      userId: "u1",
      recipients: ["a", "b", "c"].map((n) => ({ email: `${n}@x.com`, role: "EDITOR" as const })),
    });
    expect(result.status).toBe("rate-limited");
    expect(await invitations()).toHaveLength(INVITATION_HOURLY_LIMIT - 1);
    expect(await invitedEvents()).toHaveLength(0);
  });

  it("같은 상태의 1명은 통과한다 — 대조", async () => {
    await fillWindow(INVITATION_HOURLY_LIMIT - 1);
    const result = await issueInvitations(prisma, { projectId: "p", userId: "u1", recipients: [{ email: "a@x.com", role: "EDITOR" }] });
    expect(result.status).toBe("issued");
  });

  it("철회·수락된 기록도 한도에 센다 — 철회로 우회되지 않는다", async () => {
    await seedInvitation({ id: "revoked", email: "a@x.com", createdAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() - 5_000) });
    const result = await issueInvitations(prisma, { projectId: "p", userId: "u1", recipients: [{ email: "a@x.com", role: "EDITOR" }] });
    expect(result.status).toBe("rate-limited");
  });

  it("중간 DB 실패는 전체 롤백이다 — 앞 대상의 회전·생성도 남지 않는다", async () => {
    await seedInvitation({ id: "pending-a", email: "a@x.com" });
    const before = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "pending-a" } });
    // 둘째 대상의 사건 INSERT에서 실패시킨다. 전에는 없는 사용자(FK 실패)로 만들었는데, 이제 잠금 뒤 인가가 그보다 먼저 막는다.
    await pool.query(`CREATE FUNCTION fail_second_invite() RETURNS trigger AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM "ProjectEvent" WHERE "projectId" = NEW."projectId" AND "subtype" = 'member.invited') THEN RAISE EXCEPTION 'injected'; END IF;
      RETURN NEW; END $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER fail_second_invite BEFORE INSERT ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION fail_second_invite()`);
    await expect(
      issueInvitations(prisma, { projectId: "p", userId: "u1", recipients: [{ email: "a@x.com", role: "EDITOR" }, { email: "b@x.com", role: "EDITOR" }] }),
    ).rejects.toThrow();
    expect(await invitations()).toHaveLength(1);
    expect((await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "pending-a" } })).expiresAt).toEqual(before.expiresAt);
    expect(await invitedEvents()).toHaveLength(0);
  });
});

describe("issueInvitations — 잠금이 한도를 직렬화한다", () => {
  it("마지막 한 자리의 동시 요청은 하나만 통과한다", async () => {
    await fillWindow(INVITATION_HOURLY_LIMIT - 1);
    const results = await Promise.all(
      ["a", "b", "c", "d"].map((n) => issueInvitations(prisma, { projectId: "p", userId: "u1", recipients: [{ email: `${n}@x.com`, role: "EDITOR" }] })),
    );
    expect(results.filter((r) => r.status === "issued")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rate-limited")).toHaveLength(3);
    expect(await invitations()).toHaveLength(INVITATION_HOURLY_LIMIT);
    expect(await invitedEvents()).toHaveLength(1);
  });

  it("같은 주소의 동시 요청은 하나만 통과한다 — 60초를 우회하지 않고 유효 링크도 하나다", async () => {
    const results = await Promise.all(
      [0, 1, 2].map(() => issueInvitations(prisma, { projectId: "p", userId: "u1", recipients: [{ email: "a@x.com", role: "EDITOR" }] })),
    );
    expect(results.filter((r) => r.status === "issued")).toHaveLength(1);
    expect(await live("a@x.com")).toHaveLength(1);
  });
});

describe("reissueInvitation — 저장된 주소·역할로 재발급", () => {
  it("새 초대(만료 7일·현재 OWNER)와 사건을 만들고 옛 링크를 무효로 한다", async () => {
    await seedInvitation({ id: "inv", email: "a@x.com", role: "OWNER", expiresAt: new Date(Date.now() + 2 * DAY) });
    const snapshot = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "inv" } });
    const result = await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" });
    expect(result.status).toBe("issued");
    if (result.status !== "issued") return;
    expect(result.invitation.email).toBe("a@x.com");

    const fresh = (await live("a@x.com"))[0];
    expect(fresh?.id).not.toBe("inv");
    expect(fresh?.role).toBe("OWNER");
    expect(fresh?.invitedBy).toBe("u1");
    expect(fresh?.tokenHash).toBe(hashInviteToken(result.invitation.token));
    expect((fresh?.expiresAt.getTime() ?? 0) - (fresh?.createdAt.getTime() ?? 0)).toBe(7 * DAY);
    expect(await invitedEvents()).toHaveLength(1);
    // 옛 링크의 수락 시도는 소비되지 않는다.
    expect(await acceptWithSnapshot(snapshot)).toBe(0);
  });

  it.each([
    ["다른 프로젝트", { id: "inv", email: "a@x.com", projectId: "q" }],
    ["수락됨", { id: "inv", email: "a@x.com", acceptedAt: new Date() }],
    ["만료·철회됨", { id: "inv", email: "a@x.com", expiresAt: new Date(Date.now() - 1_000) }],
  ])("%s 초대는 not-found이고 아무것도 쓰지 않는다", async (_name, seed) => {
    await seedInvitation(seed);
    const result = await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" });
    expect(result).toEqual({ status: "not-found" });
    expect(await invitations("p")).toHaveLength("projectId" in seed ? 0 : 1);
    expect(await invitedEvents()).toHaveLength(0);
  });

  it("없는 id는 not-found다", async () => {
    await expect(reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "nope" })).resolves.toEqual({ status: "not-found" });
  });

  it("주소를 복호화할 수 없으면 쓰기 전에 거부한다", async () => {
    await seedInvitation({ id: "inv", email: "a@x.com" });
    // 옛 키로 봉인된 행 — 봉투의 kid만 바꾼다(`harness.ts`의 `sealedWithLostKey`와 같은 방법).
    const row = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "inv" } });
    const lost = row.email.split(":").map((part, i) => (i === 2 ? "lost" : part)).join(":");
    await prisma.projectInvitation.update({ where: { id: "inv" }, data: { email: lost } });
    const result = await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" });
    expect(result).toEqual({ status: "unreadable" });
    expect(await invitations()).toHaveLength(1);
    expect(await invitedEvents()).toHaveLength(0);
  });

  it("같은 주소 60초 제한을 공유한다", async () => {
    await seedInvitation({ id: "inv", email: "a@x.com", createdAt: new Date(Date.now() - 10_000) });
    const result = await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" });
    expect(result.status).toBe("rate-limited");
    expect(await invitations()).toHaveLength(1);
  });

  it("그 사이 멤버가 된 주소면 거부한다", async () => {
    await seedInvitation({ id: "inv", email: "member@x.com" });
    const result = await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" });
    expect(result).toEqual({ status: "invalid-rows", rowErrors: [{ index: 0, code: "already-member" }] });
    expect(await invitedEvents()).toHaveLength(0);
  });
});

describe("reissueInvitation — 수락·철회와의 교차", () => {
  it("수락이 먼저 확정되면 재발급·사건이 0건이다", async () => {
    await seedInvitation({ id: "inv", email: "joiner@x.com" });
    const snapshot = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "inv" } });
    expect(await acceptWithSnapshot(snapshot)).toBe(1);
    const result = await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" });
    expect(result).toEqual({ status: "not-found" });
    expect(await invitations()).toHaveLength(1);
    expect(await invitedEvents()).toHaveLength(0);
  });

  it("재발급이 먼저 확정되면 옛 링크 수락은 실패한다", async () => {
    await seedInvitation({ id: "inv", email: "joiner@x.com" });
    const snapshot = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: "inv" } });
    expect((await reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" })).status).toBe("issued");
    expect(await acceptWithSnapshot(snapshot)).toBe(0);
  });

  it("철회 뒤 재발급은 not-found다", async () => {
    await seedInvitation({ id: "inv", email: "a@x.com" });
    // `revokeInvitation`의 쓰기 — 만료 시각을 당긴다.
    await prisma.projectInvitation.updateMany({ where: { id: "inv", projectId: "p", acceptedAt: null }, data: { expiresAt: new Date() } });
    await expect(reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" })).resolves.toEqual({ status: "not-found" });
    expect(await invitedEvents()).toHaveLength(0);
  });

  it("수락 트랜잭션과 겹쳐 교착으로 롤백되면 반쪽 상태가 남지 않는다", async () => {
    await seedInvitation({ id: "inv", email: "joiner@x.com" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 수락: 초대 행을 먼저 잡고, 뒤에서 멤버 행을 넣는다(= Project에 FK 공유 잠금).
      await client.query(`UPDATE "ProjectInvitation" SET "acceptedAt" = now() WHERE "id" = 'inv' AND "acceptedAt" IS NULL`);
      const reissue = reissueInvitation(prisma, { projectId: "p", userId: "u1", invitationId: "inv" }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      let acceptCommitted = false;
      try {
        await client.query(`INSERT INTO "ProjectMember" ("projectId", "userId", "role", "updatedAt") VALUES ('p', 'u3', 'EDITOR', now())`);
        await client.query("COMMIT");
        acceptCommitted = true;
      } catch {
        await client.query("ROLLBACK");
      }
      const settled = await reissue;
      const rows = await invitations();
      const events = await invitedEvents();
      const issued = settled.ok && settled.value.status === "issued";
      // 어느 쪽이 교착 희생자가 되든: 재발급이 확정됐을 때만 새 초대·사건이 하나씩 있다.
      expect(rows).toHaveLength(issued ? 2 : 1);
      expect(events).toHaveLength(issued ? 1 : 0);
      // 수락과 재발급이 둘 다 이기지 않는다.
      expect(acceptCommitted && issued).toBe(false);
    } finally {
      client.release();
    }
  });
});
