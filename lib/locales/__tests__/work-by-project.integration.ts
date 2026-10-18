import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";

import { countLocaleWork, readLocaleStates, readLocaleStatesByProject } from "../work";

/**
 * **일괄 읽기가 프로젝트별 읽기와 같은 상태를 낸다** (language-request-todo design §2 · spec 완료 조건 6). 목록·Inbox가 세는 언어 변경 작업이
 * `countLocaleWork`와 갈리면 같은 프로젝트가 화면마다 다른 수를 말한다. 접기는 한 함수(`foldLocaleStates`)라 갈릴 수 있는 자리는 조회의 좁힘
 * (보관 소스 · `projectId in ids`)과 일괄 값 수 raw다 — 그래서 실제 PostgreSQL에서 견준다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-by-project-"));
let binaries: string;
const PORT = 55711;
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

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const PROJECTS = ["p1", "p2", "p-archived", "p-quiet"] as const;

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  for (const [index, id] of PROJECTS.entries()) {
    await prisma.project.create({ data: { id, slug: id, name: id, repoHost: "github", repositoryId: String(index + 1), installationId: "2", repoOwner: "o", repoName: id, baseBranch: "main",
      archivedAt: id === "p-archived" ? new Date() : null } });
  }
});

async function surface(projectId: string, id: string, archived = false) {
  await prisma.translationSurface.create({ data: { id, projectId, slug: id, adapterName: "json-catalog", pathTemplate: `${id}/{locale}.json`, baseLocale: "en", archivedAt: archived ? new Date() : null } });
  for (const code of ["en", "ko", "fr", "de"]) await prisma.locale.create({ data: { projectId, surfaceId: id, code, name: code, isBase: code === "en" } });
  await prisma.stringKey.create({ data: { id: `${id}-hello`, projectId, surfaceId: id, key: "hello", namespace: "", sourceText: "Hello", sourceHash: "h" } });
  await prisma.stringKey.create({ data: { id: `${id}-bye`, projectId, surfaceId: id, key: "bye", namespace: "", sourceText: "Bye", sourceHash: "b" } });
  await prisma.stringKey.create({ data: { id: `${id}-gone`, projectId, surfaceId: id, key: "gone", namespace: "", sourceText: "Gone", sourceHash: "g", orphaned: true } });
}

async function value(projectId: string, surfaceId: string, key: "hello" | "bye" | "gone", localeCode: string, text: string) {
  await prisma.translation.create({ data: { projectId, surfaceId, keyId: `${surfaceId}-${key}`, localeCode, value: text } });
}

async function request(projectId: string, surfaceId: string, localeCode: string, operation: "ADD" | "REMOVE", requestedAt = new Date(1_000)) {
  await prisma.localeChange.create({ data: { projectId, surfaceId, localeCode, operation, requestedAt } });
}

/** 성공한 확인 — `startedAt`이 요청보다 뒤면 그 요청은 실렸다(F1 fix1). */
async function deliver(projectId: string, surfaceId: string, effects: { localeCode: string; effect: "create" | "delete" }[] | null, options: { invalidated?: boolean; startedAt?: Date } = {}) {
  const run = await prisma.syncRun.create({ data: { projectId, status: "SUCCEEDED", trigger: "MANUAL", startedAt: options.startedAt ?? new Date(2_000) } });
  await prisma.deliveryConfirmation.create({ data: { projectId, surfaceId, revision: `rev-${surfaceId}`, syncRunId: run.id, contextFingerprint: "ctx",
    ...(effects === null ? {} : { deliveredLocaleChanges: effects }), invalidatedAt: options.invalidated ? new Date() : null } });
}

/** design §2·tasks T2의 fixture 전부 — 두 프로젝트에 갈래를 나눠 싣고, 보관 프로젝트와 조용한 프로젝트를 둔다. */
async function seed() {
  // p1 — 확인 뒤 낸 다른 언어 요청 · 같은 언어의 두 번째 요청 · 거둘 것만 · 보관 소스.
  await surface("p1", "p1-after");
  await deliver("p1", "p1-after", [{ localeCode: "fr", effect: "create" }]);
  await request("p1", "p1-after", "de", "REMOVE", new Date(3_000));
  await request("p1", "p1-after", "fr", "ADD", new Date(500));
  await value("p1", "p1-after", "hello", "fr", "Bonjour");
  // 제거 요청한 de에도 값이 있다 — p2의 ADD de가 일괄 값 수 raw의 코드에 들어와도 p1의 값 수로 새지 않아야 한다(review-B 🟡1).
  await value("p1", "p1-after", "hello", "de", "Hallo");

  await surface("p1", "p1-again");
  await deliver("p1", "p1-again", [{ localeCode: "ko", effect: "delete" }]);
  await request("p1", "p1-again", "ko", "REMOVE", new Date(2_000));

  await surface("p1", "p1-reap");
  await deliver("p1", "p1-reap", [{ localeCode: "fr", effect: "create" }]);

  await surface("p1", "p1-archived", true);
  await request("p1", "p1-archived", "ko", "REMOVE");
  await deliver("p1", "p1-archived", [{ localeCode: "fr", effect: "create" }]);

  // p2 — 값 0개 ADD(빈 값·orphaned 키 값만) · 값 있는 ADD · 확인 안 됨 · 빈 확인.
  await surface("p2", "p2-add");
  await request("p2", "p2-add", "fr", "ADD");
  await value("p2", "p2-add", "hello", "fr", "");
  await value("p2", "p2-add", "gone", "fr", "Parti");
  await request("p2", "p2-add", "de", "ADD");
  await value("p2", "p2-add", "hello", "de", "Hallo");
  await value("p2", "p2-add", "bye", "de", "Tschüss");

  await surface("p2", "p2-unconfirmed");
  await request("p2", "p2-unconfirmed", "ko", "REMOVE");
  await deliver("p2", "p2-unconfirmed", [{ localeCode: "ko", effect: "delete" }], { invalidated: true });

  await surface("p2", "p2-empty");
  await deliver("p2", "p2-empty", []);

  // 보관 프로젝트 — 작업이 있지만 호출자가 ids에서 뺀다(design §2 리뷰 D6).
  await surface("p-archived", "pa-web");
  await request("p-archived", "pa-web", "ko", "REMOVE");

  await surface("p-quiet", "pq-web");
}

describe("readLocaleStatesByProject", () => {
  it("프로젝트마다 readLocaleStates와 같은 상태를 낸다 — 작업 수도 countLocaleWork와 같다", async () => {
    await seed();
    const ids = ["p1", "p2", "p-quiet"];
    const byProject = await readLocaleStatesByProject(prisma, ids);
    expect([...byProject.keys()]).toEqual(ids);
    for (const id of ids) {
      expect(byProject.get(id)).toEqual(await readLocaleStates(prisma, id));
      expect((byProject.get(id) ?? []).reduce((sum, state) => sum + state.work.length, 0)).toBe(await countLocaleWork(prisma, id));
    }
  });

  it("fixture가 갈래마다 뜻한 작업을 낸다 — 같음이 빈 결과끼리의 같음이 아니다", async () => {
    await seed();
    const byProject = await readLocaleStatesByProject(prisma, ["p1", "p2", "p-quiet"]);
    const work = (id: string) => (byProject.get(id) ?? []).map(state => [state.surfaceId, state.work.map(item => `${item.localeCode}:${item.current}/${item.delivered}`)]);
    expect(work("p1")).toEqual([
      // 확인 뒤 낸 de 제거는 미전달, 확인 전 fr 추가는 전달됐다.
      ["p1-after", ["de:delete/null"]],
      // 같은 언어를 확인 시각(같은 밀리초)에 다시 요청 — 전달로 세지 않는다(POSTMORTEM 2026-10-14).
      ["p1-again", ["ko:delete/null"]],
      // 행 없이 남은 전달 목록 — Publish가 거둔다.
      ["p1-reap", ["fr:null/create"]],
    ]);
    expect(work("p2")).toEqual([
      // fr은 빈 값·orphaned 키 값뿐이라 파일을 내지 않는다.
      ["p2-add", ["de:create/null"]],
      ["p2-unconfirmed", ["ko:delete/null"]],
    ]);
    expect(byProject.get("p2")?.find(state => state.surfaceId === "p2-unconfirmed")?.delivered).toBeNull();
    expect(byProject.get("p2")?.find(state => state.surfaceId === "p2-add")?.valueCounts).toEqual(new Map([["de", 2]]));
    expect(byProject.get("p-quiet")).toEqual([]);
  });

  it("ids에 없는 프로젝트는 읽지 않는다 — 보관 프로젝트의 작업이 새지 않는다", async () => {
    await seed();
    expect(await countLocaleWork(prisma, "p-archived")).toBe(1);
    const byProject = await readLocaleStatesByProject(prisma, ["p1", "p2"]);
    expect(byProject.has("p-archived")).toBe(false);
    expect([...byProject.values()].flat().map(state => state.surfaceId)).not.toContain("pa-web");
  });

  it("ADD가 없으면 값 수를 세지 않아도 같다", async () => {
    await surface("p1", "p1-web");
    await request("p1", "p1-web", "ko", "REMOVE");
    await surface("p2", "p2-web");
    await deliver("p2", "p2-web", [{ localeCode: "de", effect: "delete" }]);
    const byProject = await readLocaleStatesByProject(prisma, ["p1", "p2"]);
    expect(byProject.get("p1")).toEqual(await readLocaleStates(prisma, "p1"));
    expect(byProject.get("p2")).toEqual(await readLocaleStates(prisma, "p2"));
    expect(byProject.get("p2")?.[0]?.work).toEqual([{ localeCode: "de", current: null, delivered: "delete" }]);
  });
});
