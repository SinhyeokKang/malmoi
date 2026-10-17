import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { parseLogFilter } from "@/lib/events/filter";
import { loadEvents } from "@/lib/events/query";
import { eventSentence } from "@/lib/events/view";
import { en } from "@/messages/en";

import { expireLocaleChanges, type LocaleExpiryInput } from "../expire";
import { countLocaleWork, readLocaleStates } from "../work";
import { waitForLockWait } from "./lock-wait";

/**
 * **언어 변경 의도 만료와 작업 수** (locale-add design §1 "만료와 strict 적재" · orch O4). 순수 판정(`planLocaleExpiry`)은 표 테스트가 덮고,
 * 여기서는 I/O 껍데기가 잠금 뒤 다시 읽은 행·목록으로 판정하고, 결과대로 행·orphan·사건을 한 tx에 쓰는지를 본다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-expire-"));
let binaries: string;
const PORT = 55642;
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

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main" } });
  for (const [id, slug] of [["s-web", "web"], ["s-app", "app"]] as const) {
    await prisma.translationSurface.create({ data: { id, projectId: "p", slug, adapterName: "json-catalog", pathTemplate: `${slug}/{locale}.json`, baseLocale: "en" } });
    for (const code of ["en", "ko", "fr"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: id, code, name: code, isBase: code === "en" } });
    await prisma.stringKey.create({ data: { id: `${id}-hello`, projectId: "p", surfaceId: id, key: "hello", namespace: "", sourceText: "Hello", sourceHash: "h" } });
    await prisma.stringKey.create({ data: { id: `${id}-gone`, projectId: "p", surfaceId: id, key: "gone", namespace: "", sourceText: "Gone", sourceHash: "g", orphaned: true } });
  }
});

async function request(surfaceId: string, localeCode: string, operation: "ADD" | "REMOVE") {
  await prisma.localeChange.create({ data: { projectId: "p", surfaceId, localeCode, operation } });
}

/** 성공한 확인 — 그 실행은 이미 있는 요청 뒤에 시작했다(확인보다 뒤에 낸 요청은 전달로 세지 않는다 — F1 fix1). `startedAt`으로 그 순서를 바꾼다. */
async function deliver(surfaceId: string, effects: { localeCode: string; effect: "create" | "delete" }[] | null, invalidated = false, startedAt = new Date(Date.now() + 1_000)) {
  const run = await prisma.syncRun.create({ data: { projectId: "p", status: "SUCCEEDED", trigger: "MANUAL", startedAt } });
  await prisma.deliveryConfirmation.create({ data: { projectId: "p", surfaceId, revision: `rev-${surfaceId}`, syncRunId: run.id, contextFingerprint: "ctx",
    ...(effects === null ? {} : { deliveredLocaleChanges: effects }), invalidatedAt: invalidated ? new Date() : null } });
}

const expire = (over: Partial<LocaleExpiryInput>) => prisma.$transaction(tx => expireLocaleChanges(tx, {
  projectId: "p", surfaceId: "s-web", surfaceSlug: "web", pullRequest: "none-open",
  observed: { status: "observed", locales: ["en", "ko", "fr"] }, actor: { kind: "AUTOMATION" }, via: "nightly", ...over,
}));

async function locales(surfaceId = "s-web") {
  return prisma.locale.findMany({ where: { projectId: "p", surfaceId }, orderBy: { code: "asc" }, select: { code: true, orphaned: true } });
}

async function sentences() {
  const page = await loadEvents(prisma, en, "p", parseLogFilter({}), { timeZone: "UTC" });
  return page.rows.map(row => renderToStaticMarkup(eventSentence(en, "en", row, { actor: "Malmoi", key: null })));
}

describe("expireLocaleChanges", () => {
  it("머지된 제거 — 전달 확인·열린 PR 없음·base에 파일 없음 → 행 삭제 + orphan + 사건", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    // 소스 경계 그물(R-B1 Y2 · M11) — 다른 소스의 같은 코드 의도 행은 이 만료가 지우지 않는다.
    await request("s-app", "ko", "REMOVE");
    await deliver("s-app", [{ localeCode: "ko", effect: "delete" }]);
    expect(await expire({ observed: { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [{ localeCode: "ko", operation: "REMOVE", presence: "orphan" }], held: null });
    expect(await prisma.localeChange.findMany({ where: { projectId: "p" }, select: { surfaceId: true, localeCode: true } })).toEqual([{ surfaceId: "s-app", localeCode: "ko" }]);
    expect(await locales()).toEqual([{ code: "en", orphaned: false }, { code: "fr", orphaned: false }, { code: "ko", orphaned: true }]);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "surface.localeChangeResolved" } });
    expect(event).toMatchObject({ kind: "SURFACE", actorKind: "AUTOMATION", surfaceIds: ["s-web"], result: null });
    expect(event.payload).toMatchObject({ surfaceSlug: "web", localeChange: { locale: "ko", operation: "REMOVE", outcome: "orphan" } });
    expect((await sentences())[0]).not.toContain("added the web source");
    // 다른 소스는 그대로다.
    expect(await locales("s-app")).toEqual([{ code: "en", orphaned: false }, { code: "fr", orphaned: false }, { code: "ko", orphaned: false }]);
  });

  it("머지 없이 닫힌 제거 — 파일이 남았으면 활성으로 돌아오고 요청이 사라진다", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    expect(await expire({})).toEqual({ expired: [{ localeCode: "ko", operation: "REMOVE", presence: "active" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
    expect(await locales()).toContainEqual({ code: "ko", orphaned: false });
  });

  it.each<[string, Partial<LocaleExpiryInput>, string]>([
    ["열린 PR", { pullRequest: "open" }, "pr-open"],
    ["PR 조회 실패", { pullRequest: "failed" }, "pr-check-failed"],
    ["base 읽기 실패", { observed: { status: "unreadable" } }, "base-unreadable"],
    // 관측 0개는 "비었다"가 아니다 — 사건·Logs에는 base 읽기 실패와 같은 보류로 나간다(A1 handoff).
    ["관측 로케일 0개", { observed: { status: "observed", locales: [] } }, "base-unreadable"],
  ])("%s → 보류, 아무것도 바꾸지 않는다", async (_label, over, held) => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    const before = await locales();
    expect(await expire({ ...over, observed: over.observed ?? { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [], held });
    expect(await prisma.localeChange.count()).toBe(1);
    expect(await locales()).toEqual(before);
    expect(await prisma.projectEvent.count()).toBe(0);
  });

  it("전달 전 요청·무효화 중인 확인은 만료하지 않는다", async () => {
    await request("s-web", "ko", "REMOVE");
    expect(await expire({ observed: { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [], held: "undelivered" });
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }], true);
    expect(await expire({ observed: { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [], held: "undelivered" });
    expect(await prisma.localeChange.count()).toBe(1);
  });

  it("값 0개 ADD는 첫 값 저장 전 적재에 만료·orphan되지 않는다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await request("s-web", "de", "ADD");
    expect(await expire({})).toEqual({ expired: [], held: "undelivered" });
    expect(await locales()).toContainEqual({ code: "de", orphaned: false });
    expect(await prisma.localeChange.count()).toBe(1);
  });

  it("전달된 ADD가 base에 관측되면 일반 언어로 만료한다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo" } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", [{ localeCode: "de", effect: "create" }]);
    expect(await expire({ observed: { status: "observed", locales: ["en", "ko", "fr", "de"] } }))
      .toEqual({ expired: [{ localeCode: "de", operation: "ADD", presence: "active" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
  });

  it("orphan인데 ADD 행(구버전 롤백 잔재)은 열린 PR이 있어도 만료한다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await request("s-web", "de", "ADD");
    expect(await expire({ pullRequest: "open" })).toEqual({ expired: [{ localeCode: "de", operation: "ADD", presence: "orphan" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
  });

  it("행이 없으면 읽기만 하고 아무것도 쓰지 않는다", async () => {
    expect(await expire({})).toEqual({ expired: [], held: null });
    expect(await prisma.projectEvent.count()).toBe(0);
  });
});

/**
 * **만료는 그 행의 효과를 전달 목록에서도 뺀다** (#266 — design §1). 만료 조건이 열린 PR 없음을 확인했으므로 그 효과는 어느 PR에도 실려 있지 않다.
 * 남겨 두면 미머지 종료 뒤 같은 언어를 다시 요청했을 때 현재 = 전달이 되어 Publish가 싣지 않고, 다음 방문이 그 요청을 지운다.
 */
describe("expireLocaleChanges — 확인보다 뒤에 낸 요청 (F1 fix1)", () => {
  it("확인한 실행이 시작된 뒤에 낸 제거는 옛 전달 목록과 견주지 않는다 — 열린 PR이 없어도 만료하지 않고 작업 1이다", async () => {
    // 전달 후 취소로 행 없이 남은 목록 — 그 뒤 같은 언어를 다시 요청했다.
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }], false, new Date(Date.now() - 60_000));
    await request("s-web", "ko", "REMOVE");
    expect(await expire({})).toEqual({ expired: [], held: "undelivered" });
    expect(await prisma.localeChange.count()).toBe(1);
    expect(await countLocaleWork(prisma, "p", "s-web")).toBe(1);
    const [state] = await readLocaleStates(prisma, "p", "s-web");
    expect(state?.work).toEqual([{ localeCode: "ko", current: "delete", delivered: null }]);
  });
});

describe("expireLocaleChanges — 전달 목록 정리 (#266)", () => {
  const confirmation = (surfaceId = "s-web") => prisma.deliveryConfirmation.findUniqueOrThrow({ where: { projectId_surfaceId: { projectId: "p", surfaceId } } });

  it("머지 없이 닫힌 제거가 만료되면 전달 목록에서 그 삭제가 빠지고 언어 작업이 0이다 — 확인 revision은 그대로다", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    // 다른 소스의 같은 코드 효과는 이 만료가 건드리지 않는다.
    await request("s-app", "ko", "REMOVE");
    await deliver("s-app", [{ localeCode: "ko", effect: "delete" }]);
    await expire({});
    expect(await confirmation()).toMatchObject({ deliveredLocaleChanges: [], revision: "rev-s-web", invalidatedAt: null });
    expect(await countLocaleWork(prisma, "p", "s-web")).toBe(0);
    expect(await confirmation("s-app")).toMatchObject({ deliveredLocaleChanges: [{ localeCode: "ko", effect: "delete" }] });
  });

  it("관측된 ADD가 만료되면 그 create도 빠진다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo" } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", [{ localeCode: "de", effect: "create" }]);
    await expire({ observed: { status: "observed", locales: ["en", "ko", "fr", "de"] } });
    expect(await confirmation()).toMatchObject({ deliveredLocaleChanges: [] });
  });

  it("만료된 행의 효과만 뺀다 — 남은 행의 효과는 정규 순서로 남는다", async () => {
    // 열린 PR이 있어 ko 제거는 보류되고, 모순 행(orphan ADD)만 만료된다.
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await request("s-web", "de", "ADD");
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }, { localeCode: "de", effect: "create" }]);
    expect(await expire({ pullRequest: "open" })).toEqual({ expired: [{ localeCode: "de", operation: "ADD", presence: "orphan" }], held: "pr-open" });
    expect(await confirmation()).toMatchObject({ deliveredLocaleChanges: [{ localeCode: "ko", effect: "delete" }] });
  });

  it("보류된 만료는 전달 목록을 바꾸지 않는다", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    await expire({ pullRequest: "open" });
    expect(await confirmation()).toMatchObject({ deliveredLocaleChanges: [{ localeCode: "ko", effect: "delete" }] });
  });

  it("무효화 중인 확인은 건드리지 않는다 — 확인 안 됨은 그대로 확인 안 됨이다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", [{ localeCode: "de", effect: "create" }], true);
    expect(await expire({ pullRequest: "open" })).toMatchObject({ expired: [{ localeCode: "de" }] });
    expect(await confirmation()).toMatchObject({ deliveredLocaleChanges: [{ localeCode: "de", effect: "create" }], invalidatedAt: expect.any(Date) });
  });
});

/**
 * **해소 사건의 PR 번호** (locale-add 2차 런 E0 — 시안 Logs "closed in #128"). 그 의도를 실었던 PR/MR = 마지막 전달 확인 실행의 저장된 주소다.
 * 효과가 전달 목록에 없던 의도(모순 행·리포에서 직접 추가)는 어느 PR에도 실리지 않았으므로 `null`이다. 끝 단언은 Logs가 읽는 파서 출력이다.
 */
describe("expireLocaleChanges — 해소 사건의 PR 번호", () => {
  async function resolvedPullRequests() {
    const page = await loadEvents(prisma, en, "p", parseLogFilter({}), { timeZone: "UTC" });
    return page.rows.flatMap(row => (row.payload?.kind === "SURFACE" && row.payload.localeChange !== undefined ? [[row.payload.localeChange.locale, row.payload.localeChange.pullRequest]] : []));
  }
  const runUrl = (url: string | null) => prisma.syncRun.updateMany({ where: { projectId: "p" }, data: { prUrl: url } });

  it("GitHub — 전달된 제거는 확인 실행의 PR 번호를 싣는다", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    await runUrl("https://github.com/o/r/pull/128");
    await expire({ observed: { status: "observed", locales: ["en", "fr"] } });
    expect(await resolvedPullRequests()).toEqual([["ko", { number: 128 }]]);
  });

  it("GitLab — MR iid를 숫자만 싣는다", async () => {
    await prisma.project.update({ where: { id: "p" }, data: { repoHost: "gitlab" } });
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo" } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", [{ localeCode: "de", effect: "create" }]);
    await runUrl("https://gitlab.com/g/r/-/merge_requests/7");
    await expire({ observed: { status: "observed", locales: ["en", "ko", "fr", "de"] } });
    expect(await resolvedPullRequests()).toEqual([["de", { number: 7 }]]);
  });

  it("전달 목록에 없던 의도·주소 없는 실행은 null이다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await request("s-web", "de", "ADD");
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    await runUrl(null);
    await expire({ observed: { status: "observed", locales: ["en", "fr"] } });
    expect(await resolvedPullRequests()).toEqual(expect.arrayContaining([["de", null], ["ko", null]]));
  });

  // 주소는 살아 있다 — 번호가 있어도 그 의도의 효과가 목록에 없으면 싣지 않는다(목록 조건을 주소 조건과 따로 잰다).
  it("리포에서 직접 추가돼 관측된 ADD(목록에 create 없음)는 마지막 PR 번호를 싣지 않는다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo" } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", []);
    await runUrl("https://github.com/o/r/pull/128");
    await expire({ observed: { status: "observed", locales: ["en", "ko", "fr", "de"] } });
    expect(await resolvedPullRequests()).toEqual([["de", null]]);
  });

  it("모순 행(orphan인데 ADD)은 마지막 PR 번호를 싣지 않는다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", []);
    await runUrl("https://github.com/o/r/pull/128");
    await expire({});
    expect(await resolvedPullRequests()).toEqual([["de", null]]);
  });

  // 확인 뒤 요청은 판정 목록이 뺀다 — 저장 목록을 쓰면 옛 요청의 PR이 새 요청에 붙는다(R-E0 Y2).
  it("전달 후 취소 뒤 확인보다 늦게 다시 낸 추가는 옛 PR 번호를 싣지 않는다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo" } });
    // #5가 de 생성을 실었고(확인 R5), 취소로 행이 지워져 저장 목록에 `de create`만 남았다 — 그 뒤 같은 언어를 다시 추가했다.
    await deliver("s-web", [{ localeCode: "de", effect: "create" }], false, new Date(Date.now() - 60_000));
    await runUrl("https://github.com/o/r/pull/5");
    await request("s-web", "de", "ADD");
    // #5가 머지돼 옛 파일이 base에 들어갔고, 야간이 관측된 ADD를 만료한다.
    await expire({ observed: { status: "observed", locales: ["en", "ko", "fr", "de"] } });
    expect(await resolvedPullRequests()).toEqual([["de", null]]);
  });
});

describe("readLocaleStates · countLocaleWork", () => {
  it("값 수는 활성 키의 비지 않은 값만 센다 — 값 0개 ADD는 작업이 아니다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await request("s-web", "de", "ADD");
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-gone", localeCode: "de", value: "Weg" } });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "" } });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    await prisma.translation.updateMany({ where: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de" }, data: { value: "Hallo" } });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    const [web] = await readLocaleStates(prisma, "p");
    expect(web).toMatchObject({ surfaceId: "s-web", current: [{ localeCode: "de", effect: "create" }], delivered: [], work: [{ localeCode: "de", current: "create", delivered: null }] });
    expect(web!.valueCounts.get("de")).toBe(1);
  });

  it("행 없이 전달 목록만 남은 소스(전달 후 취소)도 작업이다 — 보관된 소스는 세지 않는다", async () => {
    await deliver("s-app", [{ localeCode: "ko", effect: "delete" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    expect((await readLocaleStates(prisma, "p")).map(state => state.surfaceId)).toEqual(["s-app"]);
    expect(await countLocaleWork(prisma, "p", "s-web")).toBe(0);
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { archivedAt: new Date() } });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
  });

  it("호출자의 tx 스냅샷에서 읽는다", async () => {
    await request("s-web", "ko", "REMOVE");
    const counted = await prisma.$transaction(async tx => {
      const first = await countLocaleWork(tx, "p");
      await tx.localeChange.deleteMany({ where: { projectId: "p" } });
      return [first, await countLocaleWork(tx, "p")];
    });
    expect(counted).toEqual([1, 0]);
  });
});

/**
 * **만료가 스스로 잡는 잠금** (R-B1 Y3 · M13) — `Project`→`TranslationSurface`. 잠금 뒤 다시 읽어야 대기 중 커밋된 요청·취소를 본다.
 * 대기는 고정 sleep이 아니라 `pg_stat_activity`로 관측한다.
 */
describe("expireLocaleChanges — 잠금 계약", () => {
  async function waitsBehind(sql: string) {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      let settled = false;
      const pending = expire({ observed: { status: "observed", locales: ["en", "fr"] } }).finally(() => { settled = true; });
      await waitForLockWait(pool);
      expect(settled).toBe(false);
      // 대기 중 커밋된 취소 — 잠금 뒤 다시 읽으므로 만료할 행이 없다.
      await client.query(`DELETE FROM "LocaleChange" WHERE "projectId" = 'p' AND "surfaceId" = 's-web'`);
      await client.query("COMMIT");
      expect(await pending).toEqual({ expired: [], held: null });
      expect(await locales()).toContainEqual({ code: "ko", orphaned: false });
    } finally {
      // 단언이 실패해 COMMIT 전에 빠져나오면 잠금을 쥔 연결이 풀로 돌아가 다음 테스트를 막는다.
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }

  it("Project 행을 쥔 tx 뒤에서 기다린다", async () => {
    await waitsBehind(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
  });

  it("그 소스 행을 쥔 tx 뒤에서 기다린다", async () => {
    await waitsBehind(`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = 'p' AND "id" = 's-web' FOR UPDATE`);
  });
});
