import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { sealGitLabToken } from "@/lib/credentials/storage";
import { optionalEnv } from "@/lib/env";
import { parseLogFilter } from "@/lib/events/filter";
import { loadEvents } from "@/lib/events/query";
import { eventFailureMessage, eventSentence } from "@/lib/events/view";
import { connectionProblem, homeBannerState, planHomeState, repositoryConnectionState } from "@/lib/home/state";
import { metaTabs } from "@/lib/home/meta";
import { REPO_COLUMNS, repoTargetOf } from "@/lib/repo-host/target";
import { en } from "@/messages/en";

import { createFakeGitLabRepo, type FakeRepoOptions } from "./fake-repo";

/**
 * **GitLab 연결 상태 시나리오** (gitlab-repositories tasks §3 마지막 항목 · B 인계의 "C 몫"). 진입점 코어 → 가짜 GitLab(전역 fetch) → 격리 PG →
 * **화면 판정 출력**(설정 연결 배지 `repositoryConnectionState` · Home 배너 `homeBannerState` · Home 메타 Connection 행 `metaTabs` · Logs `eventSentence`·
 * `eventFailureMessage` · Inbox `loadAttentionInbox`(→ `collectAttention`) · Sync/브랜치/소스 추가 결과 코드)으로 단언한다. 화면이 읽지 않는 DB 행에서
 * 멈춘 단언은 없다 — 남은 DB 단언(`pendingEditToken`·`SyncRun.errorCode`·키 수)은 뷰 단언과 **함께** 그 근거를 고정한다(R-C Astra ⚪2).
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 공유 dev/prod 접속 변수는 읽지 않는다. 토큰 봉투 키는 `vitest.setup.ts`의 테스트 키다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-gitlab-state-"));
let binaries: string;
const PORT = 55641;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

vi.mock("@/lib/db", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { importRepository } = await import("@/lib/onboarding-run/import");
const { listLinkedBranches } = await import("@/lib/onboarding-run/branches");
const { addSources } = await import("@/lib/onboarding-run/add");
const { createProjectFromRepo } = await import("@/lib/onboarding-run/create");
const { loadConnectionHealth } = await import("@/lib/repo-host");
const { publishProject } = await import("@/lib/sync/publish");
const { runNightly } = await import("@/lib/nightly/run");
const { loadOpenPrForImportGate } = await import("@/lib/projects/open-pr");
const { loadAttentionInbox } = await import("@/lib/inbox/load");

/** Inbox가 그 사용자에게 그 프로젝트로 보이는 항목 종류 — Inbox 화면의 뷰 모델(`planInbox`)이다. */
async function inboxKinds(userId: string, slug = "p1"): Promise<string[]> {
  const plan = await loadAttentionInbox(prisma, userId);
  return plan.groups.find((group) => group.project.slug === slug)?.items.map((item) => item.kind) ?? [];
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
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  // 원격 실패를 로그로만 남기는 경로가 많다 — 출력은 막고, 아래 PAT 노출 단언이 내용을 본다.
  for (const level of ["error", "warn", "log", "info"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const REPO = "87515176";
const BASE = "b".repeat(40);
const TOKEN_A = "glpat-connector-a";
const TOKEN_B = "glpat-owner-b";
const EN = '{\n  "hello": "Hello"\n}\n';
const KO = '{\n  "hello": "안녕"\n}\n';

/** 연결자 owner-a(GitLab 101) · 다른 OWNER owner-b(GitLab 202). 연결은 봉투로 바로 넣는다(검증 왕복은 `lib/gitlab-connect`의 시나리오가 잰다). */
async function seed(options: { expiresAt?: Date | null; members?: { userId: string; role: "OWNER" | "EDITOR" }[] } = {}) {
  for (const id of ["owner-a", "owner-b"]) await prisma.user.create({ data: { id, email: `${id}@example.test` } });
  const a = await prisma.gitLabConnection.create({ data: { userId: "owner-a", token: sealGitLabToken(TOKEN_A, { userId: "owner-a" }), gitlabUserId: "101", username: "alice", scopes: ["api"], expiresAt: options.expiresAt ?? null } });
  await prisma.gitLabConnection.create({ data: { userId: "owner-b", token: sealGitLabToken(TOKEN_B, { userId: "owner-b" }), gitlabUserId: "202", username: "bob", scopes: ["api"] } });
  await prisma.project.create({ data: {
    id: "p1", slug: "p1", name: "p1", repoHost: "gitlab", repoOwner: "g/sub", repoName: "app", repositoryId: REPO, gitlabConnectionId: a.id, baseBranch: "main",
    members: { create: options.members ?? [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }] },
    surfaces: { create: { id: "p1-s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false, lastCommitSha: "a".repeat(40), lastCommitAt: new Date("2026-10-01T00:00:00Z") } },
  } });
  await prisma.project.update({ where: { id: "p1" }, data: { defaultSurfaceId: "p1-s" } });
  return a.id;
}

function serve(over: Partial<FakeRepoOptions> = {}) {
  const repo = createFakeGitLabRepo({
    repositoryId: REPO, branches: { main: BASE, dev: BASE }, commits: { [BASE]: { "i18n/en.json": EN, "i18n/ko.json": KO } },
    members: { 101: 50 }, ...over,
  });
  vi.stubGlobal("fetch", repo.fetch);
  return repo;
}

/** 어느 PAT로 불렀나 — 경로별로 토큰을 모은다. */
const tokensFor = (repo: ReturnType<typeof createFakeGitLabRepo>, test: (path: string) => boolean) =>
  [...new Set(repo.calls.filter((call) => test(call.url.pathname)).map((call) => call.headers.get("PRIVATE-TOKEN")))];

/** 설정 화면·Home이 그리는 연결 상태 — 페이지와 같은 함수(설정은 메모 없이 실물을 본다). */
async function screens() {
  const row = await prisma.project.findUniqueOrThrow({ where: { id: "p1" }, select: { ...REPO_COLUMNS, archivedAt: true } });
  const health = await loadConnectionHealth(repoTargetOf(row));
  const problem = connectionProblem(health.status);
  const settings = repositoryConnectionState(health.status, problem);
  const state = planHomeState({ archived: false, connection: health, surfaces: [{ importError: null, importing: false }], counts: { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 1 } });
  const meta = metaTabs({
    repository: { owner: row.repoOwner, name: row.repoName, branch: "main", connection: settings },
    ciConfigured: false, surfaceCount: 1, keys: 0, members: 2, pendingInvites: 0, createdAt: new Date(), archivedAt: null, lastSync: null, lastPublish: null, held: null, prState: "absent",
  }).project.flat().find((r) => r.kind === "connection");
  return { health: health.status, settings, home: homeBannerState({ state, problem, failure: null }), meta: meta?.state };
}

describe("호출자 권한별 — 읽기 OWNER는 Sync·브랜치 목록, 쓰기 경로는 거부 (B 인계 C 몫 · tasks §2 B2)", () => {
  it.each([[30, "Developer"], [20, "Reporter"]])("⚠️ %i(%s) OWNER: 수동 Sync·설정 브랜치 목록 성공 · 생성·소스 추가는 repo-read-only — I/O는 연결자 PAT, 권한 조회만 호출자 PAT", async (level) => {
    await seed();
    const repo = serve({ members: { 101: 50, 202: level } });

    expect(await listLinkedBranches(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: true, names: ["main", "dev"], defaultBranch: "main", truncated: false });
    const sync = await importRepository(prisma, { userId: "owner-b" }, { slug: "p1", approval: null });
    expect(sync.outcome).toMatchObject({ ok: true });
    expect(await addSources(prisma, { userId: "owner-b" }, { slug: "p1", picks: [{ adapter: "json-catalog", pathTemplate: "other/{locale}.json", baseLocale: "en" }] })).toEqual({ ok: false, error: "repo-read-only" });
    expect(await createProjectFromRepo(prisma, { userId: "owner-b" }, { host: "gitlab", repositoryId: REPO, slug: "p-new", name: "New", baseBranch: "main", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] }))
      .toEqual({ ok: false, error: "repo-read-only" });

    // 권한 조회(`members/all`)는 호출자 자신의 PAT, 리포 읽기(브랜치·트리·blob·크기)는 프로젝트가 참조하는 연결의 PAT다.
    expect(tokensFor(repo, (p) => p.includes("/members/all/"))).toEqual([TOKEN_B]);
    expect(tokensFor(repo, (p) => p.includes("/repository/") || p.endsWith("/graphql"))).toEqual([TOKEN_A]);
    expect(repo.writes()).toEqual([]);
    expect(await prisma.translationSurface.count({ where: { projectId: "p1" } })).toBe(1);
    expect(await prisma.project.count()).toBe(1);
  });

  it("Maintainer(40) OWNER: 소스 추가는 프로젝트 참조 연결로 읽고 · 새 GitLab 프로젝트 생성은 자기 연결을 참조한다", async () => {
    await seed();
    const repo = serve({ members: { 101: 50, 202: 40 }, commits: { [BASE]: { "i18n/en.json": EN, "i18n/ko.json": KO, "other/en.json": EN } } });
    expect(await addSources(prisma, { userId: "owner-b" }, { slug: "p1", picks: [{ adapter: "json-catalog", pathTemplate: "other/{locale}.json", baseLocale: "en" }] })).toMatchObject({ ok: true });
    expect(tokensFor(repo, (p) => p.includes("/repository/") || p.endsWith("/graphql"))).toEqual([TOKEN_A]);
    repo.reset();
    const created = await createProjectFromRepo(prisma, { userId: "owner-b" }, { host: "gitlab", repositoryId: REPO, slug: "p-new", name: "New", baseBranch: "main", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] });
    expect(created).toMatchObject({ ok: true, slug: "p-new" });
    // 새 리포에는 프로젝트가 없다 — 열 수 있는 연결은 호출자의 것뿐이고, 만든 프로젝트가 그 연결을 참조한다.
    expect(tokensFor(repo, () => true)).toEqual([TOKEN_B]);
    const b = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-b" } });
    expect(await prisma.project.findUniqueOrThrow({ where: { slug: "p-new" }, select: { repoHost: true, gitlabConnectionId: true, installationId: true, repoOwner: true } }))
      .toEqual({ repoHost: "gitlab", gitlabConnectionId: b.id, installationId: null, repoOwner: "g/sub" });
    expect(repo.writes()).toEqual([]);
  });

  it("⚠️ Guest(10)는 읽기도 거부(repo-forbidden) — 리포를 읽지 않는다", async () => {
    await seed();
    const repo = serve({ members: { 101: 50, 202: 10 } });
    expect(await listLinkedBranches(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "repo-forbidden" });
    expect((await importRepository(prisma, { userId: "owner-b" }, { slug: "p1", approval: null })).outcome).toEqual({ ok: false, error: "repo-forbidden" });
    expect(repo.calls.filter((call) => call.url.pathname.includes("/repository/"))).toEqual([]);
  });

  it("⚠️ 연결자가 아닌 Maintainer OWNER의 Sync는 repo-replaced가 아니다 — 연결 id가 달라도 같은 리포다(sameRepository)", async () => {
    await seed();
    const repo = serve({ members: { 101: 50, 202: 40 } });
    expect((await importRepository(prisma, { userId: "owner-b" }, { slug: "p1", approval: null })).outcome).toMatchObject({ ok: true });
    expect(tokensFor(repo, (p) => p.includes("/repository/"))).toEqual([TOKEN_A]);
    // 적재가 리포 값을 DB로 가져왔다 — 소스 상세가 말하는 키다.
    expect(await prisma.stringKey.count({ where: { projectId: "p1", orphaned: false } })).toBe(1);
  });
});

describe("연결 상태 → 설정 배지 · Home 배너 · Home 메타 (design §2 톤 표)", () => {
  it.each([
    ["정상", {}, null, "ok", "connected", null],
    ["⚠️ 토큰 철회·만료(401)", { failOn: [{ key: "GET ", status: 401 }] }, null, "connection-unusable", "disconnected", "disconnected"],
    ["스코프 부족(403 insufficient_scope)", { failOn: [{ key: "GET ", status: 403, body: { error: "insufficient_scope" } }] }, null, "connection-unusable", "disconnected", "disconnected"],
    ["⚠️ 주인의 권한 상실(404)", { failOn: [{ key: "GET ", status: 404 }] }, null, "connection-unusable", "disconnected", "disconnected"],
    ["보관된 GitLab 프로젝트", { archived: true }, null, "connection-unusable", "disconnected", "disconnected"],
    ["⚠️ 일시 장애(503) — 끊김으로 접지 않는다", { failOn: [{ key: "GET ", status: 503 }] }, null, "unknown", "couldNotCheck", null],
    ["⚠️ 레이트 리밋(429) — 일시 장애다", { failOn: [{ key: "GET ", status: 429 }] }, null, "unknown", "couldNotCheck", null],
    ["만료 임박(7일) — 연결은 정상이다(토큰 자리의 Expires soon은 E-ui)", {}, new Date(Date.now() + 7 * 86_400_000), "ok", "connected", null],
  ] as const)("%s", async (_label, server, expiresAt, health, settings, home) => {
    await seed({ expiresAt });
    serve(server as Partial<FakeRepoOptions>);
    expect(await screens()).toEqual({ health, settings, home, meta: settings });
  });

  it("⚠️ 저장된 만료일이 지났으면 원격 0으로 Disconnected", async () => {
    await seed({ expiresAt: new Date("2026-01-01T00:00:00Z") });
    const repo = serve();
    expect(await screens()).toEqual({ health: "connection-unusable", settings: "disconnected", home: "disconnected", meta: "disconnected" });
    expect(repo.calls).toEqual([]);
  });

  it("재시도: 일시 장애 뒤 다음 확인은 정상으로 돌아온다(설정은 메모 없이 실물을 본다)", async () => {
    await seed();
    serve({ failOn: [{ key: "GET ", status: 503, nth: 1 }] });
    expect((await screens()).settings).toBe("couldNotCheck");
    expect((await screens()).settings).toBe("connected");
  });

  it("⚠️ 연결자가 떠나면(참조 비움) 원격 0으로 Disconnected — 남의 토큰으로 계속 쓰지 않는다", async () => {
    await seed();
    const repo = serve();
    await prisma.project.update({ where: { id: "p1" }, data: { gitlabConnectionId: null } });
    expect(await screens()).toEqual({ health: "connection-removed", settings: "disconnected", home: "disconnected", meta: "disconnected" });
    expect(repo.calls).toEqual([]);
  });
});

describe("Publish — 쓰기 직전 project id 재대조 · 쓰기 중 실패 → Logs", () => {
  /** 미전달 편집 하나 — ko `hello`를 고쳤다. */
  async function pending() {
    await prisma.locale.createMany({ data: ["en", "ko"].map((code) => ({ projectId: "p1", surfaceId: "p1-s", code, name: code, isBase: code === "en", orphaned: false })) });
    await prisma.stringKey.create({ data: { id: "k1", projectId: "p1", surfaceId: "p1-s", key: "hello", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
    await prisma.translation.create({ data: { id: "t-en", projectId: "p1", surfaceId: "p1-s", keyId: "k1", localeCode: "en", value: "Hello", updatedBy: null } });
    await prisma.translation.create({ data: { id: "t-ko", projectId: "p1", surfaceId: "p1-s", keyId: "k1", localeCode: "ko", value: "반가워", updatedBy: "owner-a", pendingEditToken: "tok-1" } });
  }
  async function lastPublish() {
    const page = await loadEvents(prisma, en, "p1", parseLogFilter({}), { timeZone: "UTC" });
    const row = page.rows.find((r) => r.kind === "PUBLISH");
    if (row === undefined) throw new Error("no publish event");
    return { sentence: eventSentence(en, "en", row, { actor: "Alice", key: "k" }), reason: eventFailureMessage(en, row, false) };
  }

  it("정상: 연결자 PAT로 커밋 1회(parent = base) + MR 1개 · 편집 토큰이 전달 확인으로 비워진다 · Logs가 보냈다를 말한다", async () => {
    await seed();
    await pending();
    const repo = serve();
    const { outcome } = await publishProject(prisma, { userId: "owner-b" }, { slug: "p1" });
    expect(outcome).toMatchObject({ status: "committed" });
    expect(repo.parents.get(repo.branches.get("malmoi-i18n/sync-p1")!)).toBe(BASE);
    expect(repo.mergeRequests.filter((mr) => mr.state === "opened")).toHaveLength(1);
    expect(tokensFor(repo, () => true)).toEqual([TOKEN_A]);
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "t-ko" } })).pendingEditToken).toBeNull();
    expect((await lastPublish()).sentence).toEqual(en.logs.sentence.publish.sent("Alice"));
  });

  it("⚠️ 저장된 id와 응답 id가 다르면(이름 재사용) 리포에 쓰지 않는다 — 편집이 남고 Logs는 실패다", async () => {
    await seed();
    await pending();
    const repo = serve({ repositoryId: REPO });
    // 숫자 id로 불렀는데 다른 프로젝트 id가 온다 — 동어반복이 깨진 응답이다.
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === `/api/v4/projects/${REPO}`) return new Response(JSON.stringify({ id: 1, path_with_namespace: "evil/app", archived: false, repository_object_format: "sha1" }), { status: 200 });
      return repo.fetch(input, init);
    }) as typeof fetch);
    const { outcome } = await publishProject(prisma, { userId: "owner-a" }, { slug: "p1" });
    expect(outcome).toMatchObject({ status: "failed" });
    expect(repo.writes()).toEqual([]);
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "t-ko" } })).pendingEditToken).toBe("tok-1");
    expect((await lastPublish()).sentence).toEqual(en.logs.sentence.publish.failed("Alice"));
  });

  it("⚠️ 보관된 GitLab 프로젝트: 쓰기 전에 재연결 필요(not-installed)로 끝난다 — 재시도 없음, 편집 보존", async () => {
    await seed();
    await pending();
    const repo = serve({ archived: true });
    const { outcome } = await publishProject(prisma, { userId: "owner-a" }, { slug: "p1" });
    expect(outcome).toMatchObject({ status: "failed", retryable: false });
    expect(repo.writes()).toEqual([]);
    expect((await prisma.syncRun.findFirstOrThrow({ where: { projectId: "p1" } })).errorCode).toBe("not-installed");
    expect((await lastPublish()).reason).toBe(en.logs.reasons["not-installed"]);
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "t-ko" } })).pendingEditToken).toBe("tok-1");
  });

  it("⚠️ Publish 도중 토큰 만료(커밋 POST 401): 결과 미확인이다 — 전달 확인을 성공으로 만들지 않는다, MR을 열지 않는다", async () => {
    await seed();
    await pending();
    const repo = serve({ failOn: [{ key: "POST /repository/commits", status: 401 }] });
    const { outcome } = await publishProject(prisma, { userId: "owner-a" }, { slug: "p1" });
    expect(outcome).toMatchObject({ status: "failed" });
    expect((await prisma.syncRun.findFirstOrThrow({ where: { projectId: "p1" } })).errorCode).toBe("execution-uncertain");
    expect(repo.writes().map((call) => call.url.pathname.split("/").slice(-2).join("/"))).toEqual(["repository/commits"]);
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "t-ko" } })).pendingEditToken).toBe("tok-1");
    expect((await lastPublish()).reason).toBe(en.logs.reasons["execution-uncertain"]);
  });

  it("PAT 원문이 콘솔·사건·실행 행에 0건이다(spec 완료 조건 11)", async () => {
    await seed();
    await pending();
    serve({ failOn: [{ key: "POST /merge_requests", status: 502 }] });
    await publishProject(prisma, { userId: "owner-a" }, { slug: "p1" });
    const logged = JSON.stringify((["error", "warn", "log", "info"] as const).flatMap((level) => vi.mocked(console[level]).mock.calls), (_k, v: unknown) => (v instanceof Error ? `${v.name}: ${v.message}` : v));
    const stored = JSON.stringify([await prisma.projectEvent.findMany(), await prisma.syncRun.findMany()]);
    for (const text of [logged, stored]) expect(text).not.toMatch(/glpat-/);
  });
});

describe("자동 적재 보호 — 열린 MR 게이트 · 야간 (fork MR 제외 · 조회 실패는 보류)", () => {
  const own = { iid: 4, title: "t", source_branch: "malmoi-i18n/sync-p1", target_branch: "main", state: "opened" as const, source_project_id: Number(REPO), target_project_id: Number(REPO), web_url: "https://gitlab.com/g/sub/app/-/merge_requests/4" };
  async function target() {
    const row = await prisma.project.findUniqueOrThrow({ where: { id: "p1" }, include: { surfaces: true } });
    return { ...row, surfaces: row.surfaces.map((s) => ({ ...s })) };
  }

  it.each([
    ["자기 MR이 열려 있다 → 게이트가 그 MR을 든다(보류)", [own], "https://gitlab.com/g/sub/app/-/merge_requests/4"],
    ["⚠️ 동명 fork MR만 있다 → 없음(게이트 열림)", [{ ...own, iid: 9, source_project_id: 999 }], null],
  ] as const)("%s", async (_label, mergeRequests, expected) => {
    await seed();
    serve({ mergeRequests: mergeRequests.map((mr) => ({ ...mr })) });
    expect(await loadOpenPrForImportGate("p1", await target())).toBe(expected);
  });

  it("⚠️ MR 목록 조회 실패·참조 비움은 모름(undefined → pr-check-failed 보류)이다 — 없음으로 접지 않는다", async () => {
    await seed();
    serve({ failOn: [{ key: "GET /merge_requests", status: 404 }] });
    expect(await loadOpenPrForImportGate("p1", await target())).toBeUndefined();
    await prisma.project.update({ where: { id: "p1" }, data: { gitlabConnectionId: null } });
    expect(await loadOpenPrForImportGate("p1", await target())).toBeUndefined();
  });

  it("야간: base가 앞섰고 자기 MR이 열려 있으면 적재를 보류한다(deferred open-pr) — 리포 값이 DB를 덮지 않는다", async () => {
    await seed();
    serve({ mergeRequests: [{ ...own }] });
    expect(await runNightly(prisma, await target(), () => 0)).toMatchObject({ action: "skip", outcome: "deferred", reason: "open-pr" });
    expect(await prisma.stringKey.count({ where: { projectId: "p1" } })).toBe(0);
  });

  it("야간: fork MR만 있으면 연결자 PAT로 적재한다 — 앞선 실패가 Inbox에서 내려간다", async () => {
    await seed();
    await prisma.translationSurface.update({ where: { id: "p1-s" }, data: { lastImportError: "import-failed", lastImportFailedAt: new Date("2026-10-10T00:00:00Z") } });
    expect(await inboxKinds("owner-a")).toContain("import_failed");
    const repo = serve({ mergeRequests: [{ ...own, source_project_id: 999 }] });
    expect(await runNightly(prisma, await target(), () => 0)).toMatchObject({ action: "import" });
    expect(await inboxKinds("owner-a")).not.toContain("import_failed");
    expect(await prisma.stringKey.count({ where: { projectId: "p1", orphaned: false } })).toBe(1);
    expect(tokensFor(repo, () => true)).toEqual([TOKEN_A]);
  });

  it("⚠️ 야간: 기본 브랜치가 사라졌으면(개명) base-unreadable · 표면 실패 상태 — 수동 Sync는 base-branch-missing", async () => {
    await seed();
    serve({ branches: { trunk: BASE } });
    expect(await runNightly(prisma, await target(), () => 0)).toMatchObject({ action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing: true });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "p1-s" } })).lastImportError).toBe("import-failed");
    // Inbox가 그 실패를 말한다 — 연결자(OWNER)는 직접 다시 시도한다.
    expect(await inboxKinds("owner-a")).toEqual(["import_failed"]);
    expect((await importRepository(prisma, { userId: "owner-a" }, { slug: "p1", approval: null })).outcome).toMatchObject({ ok: false, error: "base-branch-missing" });
  });
});

describe("토큰 주인의 권한 강등 (R-C Astra 🟡1)", () => {
  async function pendingKo() {
    await prisma.locale.createMany({ data: ["en", "ko"].map((code) => ({ projectId: "p1", surfaceId: "p1-s", code, name: code, isBase: code === "en", orphaned: false })) });
    await prisma.stringKey.create({ data: { id: "k1", projectId: "p1", surfaceId: "p1-s", key: "hello", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
    await prisma.translation.create({ data: { id: "t-en", projectId: "p1", surfaceId: "p1-s", keyId: "k1", localeCode: "en", value: "Hello", updatedBy: null } });
    await prisma.translation.create({ data: { id: "t-ko", projectId: "p1", surfaceId: "p1-s", keyId: "k1", localeCode: "ko", value: "반가워", updatedBy: "owner-a", pendingEditToken: "tok-1" } });
  }

  it("⚠️ 주인이 Reporter로 강등: Home·설정 Disconnected · Publish는 쓰기 전에 거부(편집 보존) · 수동 Sync는 성공(읽기)", async () => {
    await seed();
    await pendingKo();
    const repo = serve({ members: { 101: 20 } });
    expect(await screens()).toEqual({ health: "connection-unusable", settings: "disconnected", home: "disconnected", meta: "disconnected" });

    const { outcome } = await publishProject(prisma, { userId: "owner-b" }, { slug: "p1" });
    expect(outcome).toMatchObject({ status: "failed", retryable: false });
    expect(repo.writes()).toEqual([]);
    expect((await prisma.syncRun.findFirstOrThrow({ where: { projectId: "p1" } })).errorCode).toBe("not-installed");
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "t-ko" } })).pendingEditToken).toBe("tok-1");

    // Sync는 읽기다 — 읽기 전용 OWNER 계약(#123)은 토큰 주인이 Reporter여도 선다. 리포 값이 DB를 덮는 strict 적재라 미전달 편집이 있으면 보류된다 — 여기선 편집을 비운다.
    await prisma.translation.update({ where: { id: "t-ko" }, data: { pendingEditToken: null } });
    expect((await importRepository(prisma, { userId: "owner-a" }, { slug: "p1", approval: null })).outcome).toMatchObject({ ok: true });
    expect(repo.writes()).toEqual([]);
  });

  it("Developer 주인 + 보호 브랜치: 연결은 정상(Connected)이고 Publish만 커밋 POST에서 실패한다 — 끊김으로 말하지 않는다", async () => {
    await seed();
    await pendingKo();
    const repo = serve({ members: { 101: 30 }, failOn: [{ key: "POST /repository/commits", status: 403, body: { message: "403 Forbidden - You are not allowed to push into this branch" } }] });
    expect((await screens()).settings).toBe("connected");
    const { outcome } = await publishProject(prisma, { userId: "owner-a" }, { slug: "p1" });
    expect(outcome).toMatchObject({ status: "failed" });
    expect(repo.writes().map((call) => call.url.pathname.split("/").slice(-2).join("/"))).toEqual(["repository/commits"]);
    expect((await prisma.translation.findUniqueOrThrow({ where: { id: "t-ko" } })).pendingEditToken).toBe("tok-1");
  });
});
