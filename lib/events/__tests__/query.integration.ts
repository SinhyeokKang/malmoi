import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { encodeUserFields } from "@/lib/credentials/records";
import { optionalEnv } from "@/lib/env";

import { PROJECT_WIDE, parseLogFilter, type LogFilter } from "../filter";
import { ACTOR_AUTOMATION, ACTOR_REMOVED, loadEvent, loadEventActors, loadEvents } from "../query";

/**
 * **활동 스트림이 실제 Postgres에서 같은 행을 내는가** (logs-rework T3c·T3d).
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`) — 로컬 PostgreSQL 바이너리를 요구하고 실제
 * 클러스터를 띄운다. `lib/keys/__tests__/list-aggregates.integration.ts`와 같은 패턴이고 공유
 * dev/prod 접속 변수는 읽지 않는다.
 *
 * 가짜 클라이언트로는 원리적으로 못 보는 것 셋을 여기서 본다: **커서 경계**(같은 시각 여러 건),
 * **배열 포함 조회**(`surfaceIds has`), **조인한 Publish 결과 필터**.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-events-"));
let binaries: string;
const PORT = 55484;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

async function resetSchema() {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}

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
  await resetSchema();
  await seed();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const AT = new Date("2026-09-20T12:00:00.000Z");

/** 프로젝트 둘 · 소스 셋(p1: A·B / p2: Z) · 사용자 둘. 테넌트 격리를 매 케이스가 함께 잰다. */
async function seed() {
  for (const [id, fields] of [["u1", { email: "kim@example.com", name: "Kim" }], ["u2", { email: "kang@example.com", name: null }]] as const) {
    await prisma.user.create({ data: { id, ...encodeUserFields(id, fields), email: encodeUserFields(id, fields).email! } });
  }
  for (const id of ["p1", "p2"]) {
    await prisma.project.create({ data: { id, slug: id, name: id, repoOwner: "o", repoName: id } });
  }
  for (const [id, projectId, slug] of [["sA", "p1", "a"], ["sB", "p1", "b"], ["sC", "p1", "c"], ["sZ", "p2", "z"]] as const) {
    await prisma.translationSurface.create({ data: { id, projectId, slug } });
  }
}

let seq = 0;

async function event(over: Partial<{
  projectId: string; kind: "TRANSLATION" | "IMPORT" | "PUBLISH" | "SURFACE" | "MEMBER" | "SETTINGS";
  occurredAt: Date; result: string | null; actorKind: "USER" | "AUTOMATION" | "UNKNOWN"; actorUserId: string | null;
  surfaceIds: string[]; surfaceScope: string; searchText: string | null; syncRunId: string | null; payload: object;
}> = {}) {
  seq += 1;
  const id = `e${String(seq).padStart(3, "0")}`;
  await prisma.projectEvent.create({
    data: {
      id,
      ref: id,
      projectId: over.projectId ?? "p1",
      kind: over.kind ?? "TRANSLATION",
      subtype: "test",
      occurredAt: over.occurredAt ?? AT,
      result: over.result ?? null,
      actorKind: over.actorKind ?? "USER",
      actorUserId: over.actorUserId === undefined ? "u1" : over.actorUserId,
      surfaceIds: over.surfaceIds ?? ["sA"],
      surfaceScope: over.surfaceScope ?? "sources",
      syncRunId: over.syncRunId ?? null,
      payload: over.payload ?? { kind: "TRANSLATION", surfaceSlug: "a", key: "k", locale: "ko", before: null, after: "v" },
      searchText: over.searchText === undefined ? id : over.searchText,
    },
  });
  return id;
}

async function publishRun(id: string, status: "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED", over: Partial<{ projectId: string; warnings: number; changed: number | null; prUrl: string | null; errorCode: string | null; surfaceIds: string[]; occurredAt: Date }> = {}) {
  const projectId = over.projectId ?? "p1";
  await prisma.syncRun.create({
    data: {
      id, projectId, status, trigger: "MANUAL", startedAt: over.occurredAt ?? AT,
      warnings: over.warnings ?? 0, changed: over.changed ?? null, prUrl: over.prUrl ?? null, errorCode: over.errorCode ?? null,
    },
  });
  return event({
    projectId, kind: "PUBLISH", syncRunId: id, surfaceIds: over.surfaceIds ?? ["sA"],
    occurredAt: over.occurredAt ?? AT,
    payload: { kind: "PUBLISH", surfaceSlugs: ["a"], refusal: null },
  });
}

const base = (over: Partial<LogFilter> = {}): LogFilter => ({ ...parseLogFilter({}), ...over });

describe("loadEvents — 정렬과 페이지 경계", () => {
  it("종류가 섞여도 한 쿼리로 시각 내림차순이다", async () => {
    const ids: string[] = [];
    for (const [index, kind] of (["TRANSLATION", "IMPORT", "PUBLISH", "SURFACE", "MEMBER", "SETTINGS"] as const).entries()) {
      ids.push(await event({ kind, occurredAt: new Date(AT.getTime() + index * 1000) }));
    }
    const page = await loadEvents(prisma, "p1", base());
    expect(page.rows.map((row) => row.ref)).toEqual([...ids].reverse());
  });

  /** ⚠️ **같은 밀리초 21건** — `occurredAt` 하나로 페이지를 넘기면 행이 사라지거나 겹친다. */
  it("같은 시각 21건이 누락·중복 없이 두 페이지로 나온다", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 21; index += 1) ids.push(await event({ occurredAt: AT }));

    const first = await loadEvents(prisma, "p1", base());
    expect(first.rows).toHaveLength(20);
    expect(first.nextCursor).not.toBe(null);

    const second = await loadEvents(prisma, "p1", base({ cursor: first.nextCursor }));
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBe(null);

    const seen = [...first.rows, ...second.rows].map((row) => row.ref);
    expect(new Set(seen).size).toBe(21);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it("마지막 페이지는 커서를 내지 않는다", async () => {
    await event();
    expect((await loadEvents(prisma, "p1", base())).nextCursor).toBe(null);
  });

  it("Home은 같은 함수를 limit 6으로 부른다", async () => {
    for (let index = 0; index < 8; index += 1) await event({ occurredAt: new Date(AT.getTime() + index * 1000) });
    const page = await loadEvents(prisma, "p1", base(), { limit: 6 });
    expect(page.rows).toHaveLength(6);
    expect(page.nextCursor).not.toBe(null);
  });
});

describe("테넌트 격리 (불변식 5)", () => {
  it("다른 프로젝트의 사건은 목록에 없다", async () => {
    await event({ projectId: "p2" });
    expect((await loadEvents(prisma, "p1", base())).rows).toEqual([]);
  });

  it("다른 프로젝트의 참조는 상세에서도 null이다", async () => {
    const ref = await event({ projectId: "p2" });
    expect(await loadEvent(prisma, "p1", ref)).toBe(null);
    expect(await loadEvent(prisma, "p2", ref)).not.toBe(null);
  });

  it("없는 참조도 null이고 던지지 않는다", async () => {
    expect(await loadEvent(prisma, "p1", "nope")).toBe(null);
  });

  it("다른 프로젝트의 소스로 좁히면 0건이다", async () => {
    await event({ surfaceIds: ["sA"] });
    expect((await loadEvents(prisma, "p1", base({ sources: ["z"] }))).rows).toEqual([]);
  });
});

describe("소스 필터 — 사건 당시 대상 집합 (결정 14)", () => {
  it("A·B를 처리한 실행이 각 필터에 한 번씩 나오고 C에는 없다", async () => {
    const ref = await event({ kind: "IMPORT", surfaceIds: ["sA", "sB"] });
    for (const source of ["a", "b"]) {
      const rows = (await loadEvents(prisma, "p1", base({ sources: [source] }))).rows;
      expect(rows.map((row) => row.ref), source).toEqual([ref]);
    }
    expect((await loadEvents(prisma, "p1", base({ sources: ["c"] }))).rows).toEqual([]);
  });

  it("나중에 소스를 추가해도 과거 실행의 집합은 바뀌지 않는다", async () => {
    const ref = await event({ surfaceIds: ["sA"] });
    await prisma.translationSurface.create({ data: { id: "sD", projectId: "p1", slug: "d" } });
    expect((await loadEvents(prisma, "p1", base({ sources: ["d"] }))).rows).toEqual([]);
    expect((await loadEvents(prisma, "p1", base({ sources: ["a"] }))).rows.map((row) => row.ref)).toEqual([ref]);
  });

  it("프로젝트 전역 사건만 따로 좁혀진다", async () => {
    const wide = await event({ kind: "MEMBER", surfaceIds: [], surfaceScope: "project-wide" });
    await event({ surfaceIds: ["sA"] });
    expect((await loadEvents(prisma, "p1", base({ sources: [PROJECT_WIDE] }))).rows.map((row) => row.ref)).toEqual([wide]);
  });

  /** ⚠️ **백필은 과거 대상 소스를 모른다** — 전체 목록엔 남고 특정 소스·전역 필터엔 안 들어간다. */
  it("백필된 Publish는 전체 목록에만 있다", async () => {
    const ref = await event({ kind: "PUBLISH", surfaceIds: [], surfaceScope: "not-recorded" });
    expect((await loadEvents(prisma, "p1", base())).rows.map((row) => row.ref)).toEqual([ref]);
    expect((await loadEvents(prisma, "p1", base({ sources: ["a"] }))).rows).toEqual([]);
    expect((await loadEvents(prisma, "p1", base({ sources: [PROJECT_WIDE] }))).rows).toEqual([]);
  });
});

describe("Publish 결과는 조인이 든다 (결정 1)", () => {
  it("SyncRun 상태가 결과 어휘로 나온다", async () => {
    for (const [status, expected] of [["RUNNING", "running"], ["SUCCEEDED", "sent"], ["SKIPPED", "nothingToSend"], ["FAILED", "failed"]] as const) {
      await resetSchema();
      await seed();
      await publishRun(`run-${status}`, status);
      const [row] = (await loadEvents(prisma, "p1", base())).rows;
      expect(row?.result, status).toBe(expected);
    }
  });

  it("실행이 나중에 닫혀도 이벤트 쪽 값이 갈리지 않는다", async () => {
    await publishRun("run-1", "RUNNING");
    await prisma.syncRun.update({ where: { id: "run-1" }, data: { status: "SUCCEEDED", changed: 3, warnings: 2, prUrl: "https://x/1" } });
    const [row] = (await loadEvents(prisma, "p1", base())).rows;
    expect(row?.result).toBe("sent");
    expect(row?.run).toEqual({ changed: 3, warnings: 2, prUrl: "https://x/1", errorCode: null });
  });

  it("완료 시각은 SyncRun에서 읽고 상세와 목록이 같다", async () => {
    const ref = await publishRun("run-time", "RUNNING");
    expect((await loadEvent(prisma, "p1", ref))?.finishedAt).toBe(null);
    const finishedAt = new Date(AT.getTime() + 12_000);
    await prisma.syncRun.update({ where: { id: "run-time", projectId: "p1" }, data: { status: "SUCCEEDED", finishedAt } });
    expect((await loadEvent(prisma, "p1", ref))?.finishedAt).toEqual(finishedAt);
    expect((await loadEvents(prisma, "p1", base())).rows[0]?.finishedAt).toEqual(finishedAt);
  });

  it("결과 필터가 조인한 Publish도 잡는다", async () => {
    const sent = await publishRun("run-ok", "SUCCEEDED", { occurredAt: new Date(AT.getTime() + 1000) });
    const imported = await event({ kind: "IMPORT", result: "imported" });
    expect((await loadEvents(prisma, "p1", base({ results: ["sent"] }))).rows.map((row) => row.ref)).toEqual([sent]);
    expect((await loadEvents(prisma, "p1", base({ results: ["imported"] }))).rows.map((row) => row.ref)).toEqual([imported]);
  });

  it("저장된 결과와 조인한 상태를 함께 본다 — 선행 거부도 실패도 각자 잡힌다", async () => {
    await publishRun("run-fail", "FAILED", { errorCode: "github-error", occurredAt: new Date(AT.getTime() + 1000) });
    const refusal = await event({ kind: "PUBLISH", result: "notStarted", payload: { kind: "PUBLISH", surfaceSlugs: [], refusal: "archived" } });
    const failed = (await loadEvents(prisma, "p1", base({ results: ["failed"] }))).rows;
    expect(failed).toHaveLength(1);
    expect((await loadEvents(prisma, "p1", base({ results: ["notStarted"] }))).rows.map((row) => row.ref)).toEqual([refusal]);
  });
});

describe("행위자 — 원문 이메일이 나가지 않는다", () => {
  it("직렬화 결과 어디에도 원문 주소가 없다", async () => {
    await event({ actorUserId: "u1" });
    const page = await loadEvents(prisma, "p1", base());
    expect(JSON.stringify(page)).not.toContain("kim@example.com");
    expect(page.rows[0]?.actor.emailLabel).toContain("***");
  });

  /** ⚠️ **같은 도메인의 두 주소가 같은 라벨이 되면 안 된다** — 목록 전체를 보고 만든다. */
  it("같은 도메인 두 사람의 라벨이 갈린다", async () => {
    await event({ actorUserId: "u1", occurredAt: new Date(AT.getTime() + 1000) });
    await event({ actorUserId: "u2" });
    const labels = (await loadEvents(prisma, "p1", base())).rows.map((row) => row.actor.emailLabel);
    expect(new Set(labels).size).toBe(2);
  });

  it("계정이 지워진 USER만 removed다 — AUTOMATION·UNKNOWN과 구별된다", async () => {
    await event({ actorKind: "USER", actorUserId: null, occurredAt: new Date(AT.getTime() + 2000) });
    await event({ actorKind: "AUTOMATION", actorUserId: null, occurredAt: new Date(AT.getTime() + 1000) });
    await event({ actorKind: "UNKNOWN", actorUserId: null });
    const rows = (await loadEvents(prisma, "p1", base())).rows;
    expect(rows.map((row) => [row.actor.kind, row.actor.removed])).toEqual([["USER", true], ["AUTOMATION", false], ["UNKNOWN", false]]);
  });

  it("행위자 필터 셋이 각각 좁힌다", async () => {
    const mine = await event({ actorUserId: "u1", occurredAt: new Date(AT.getTime() + 2000) });
    const auto = await event({ actorKind: "AUTOMATION", actorUserId: null, occurredAt: new Date(AT.getTime() + 1000) });
    const gone = await event({ actorKind: "USER", actorUserId: null });
    expect((await loadEvents(prisma, "p1", base({ actor: "u1" }))).rows.map((row) => row.ref)).toEqual([mine]);
    expect((await loadEvents(prisma, "p1", base({ actor: ACTOR_AUTOMATION }))).rows.map((row) => row.ref)).toEqual([auto]);
    expect((await loadEvents(prisma, "p1", base({ actor: ACTOR_REMOVED }))).rows.map((row) => row.ref)).toEqual([gone]);
  });

  it("행위자 목록은 등장한 사람 distinct이고 원문 주소를 담지 않는다", async () => {
    await event({ actorUserId: "u1" });
    await event({ actorUserId: "u1" });
    await event({ actorKind: "AUTOMATION", actorUserId: null });
    const actors = await loadEventActors(prisma, "p1");
    expect(actors.map((actor) => actor.id)).toEqual(["u1"]);
    expect(JSON.stringify(actors)).not.toContain("kim@example.com");
  });
});

describe("검색·기간", () => {
  it("검색은 술어 하나이고 대소문자를 가리지 않는다", async () => {
    const hit = await event({ searchText: "e900 home.title a ko" });
    await event({ searchText: "e901 other.key b en" });
    expect((await loadEvents(prisma, "p1", base({ q: "HOME.title" }))).rows.map((row) => row.ref)).toEqual([hit]);
  });

  it("기간은 고른 날 하루를 통째로 담는다", async () => {
    const inside = await event({ occurredAt: new Date("2026-09-20T23:59:59.999Z") });
    await event({ occurredAt: new Date("2026-09-21T00:00:00.000Z") });
    const filter = base({ from: "2026-09-20", to: "2026-09-20" });
    expect((await loadEvents(prisma, "p1", filter)).rows.map((row) => row.ref)).toEqual([inside]);
  });
});

describe("payload", () => {
  it("형을 못 알아봐도 던지지 않고 null이다", async () => {
    await event({ payload: { nope: true } as object, kind: "TRANSLATION" });
    const [row] = (await loadEvents(prisma, "p1", base())).rows;
    expect(row?.payload).toEqual({ kind: "TRANSLATION", surfaceSlug: "", key: "", locale: "", before: null, after: null });
  });

  it("번역 payload의 전후 값이 전문 그대로 돌아온다", async () => {
    const long = "x".repeat(10_000);
    await event({ payload: { kind: "TRANSLATION", surfaceSlug: "a", key: "k", locale: "ko", before: "", after: long } });
    const [row] = (await loadEvents(prisma, "p1", base())).rows;
    expect(row?.payload).toMatchObject({ before: "", after: long });
  });
});

it("진행 중 Import는 Running 필터와 목록에서 같은 결과다", async () => {
  const ref = await event({ kind: "IMPORT", result: null, payload: { kind: "IMPORT", source: "manual" } });
  expect((await loadEvent(prisma, "p1", ref))?.result).toBe("running");
  expect((await loadEvents(prisma, "p1", base({ results: ["running"] }))).rows.map(row => row.ref)).toEqual([ref]);
});

it("project-wide라는 실제 소스와 프로젝트 전역 사건이 구별된다", async () => {
  await prisma.translationSurface.create({ data: { id: "sWide", projectId: "p1", slug: "project-wide" } });
  const source = await event({ surfaceIds: ["sWide"] });
  await event({ kind: "SETTINGS", surfaceIds: [], surfaceScope: "project-wide" });
  expect((await loadEvents(prisma, "p1", base({ sources: ["project-wide"] }))).rows.map(row => row.ref)).toEqual([source]);
});
