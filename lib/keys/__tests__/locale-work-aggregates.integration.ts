import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { loadAttentionInbox } from "@/lib/inbox/load";
import { addLocale, cancelLocaleRemoval, previewLocaleRemoval, removeLocale } from "@/lib/locales/change";
import { hashPushToken } from "@/lib/push/token";
import { loadSource, loadSources } from "@/lib/sources/query";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";
import { en } from "@/messages/en";

import { loadProjectListAggregates, loadReviewAttention, loadSurfaceCounts } from "../query";
import { searchKeys } from "../search";
import { loadTranslationDetail, loadTranslationList, loadTranslationTree } from "../translation-list";

/**
 * **언어 상태와 집계** (locale-add tasks §6 — 완료율·Home·Keys 검색·Inbox·Sources 수 · spec 22). 진입점(언어 변경 코어) → 격리 PG →
 * 화면이 쓰는 뷰 모델(목록 진행률·검토/빈 언어 항목·검색 결과·번역 목록 분모·상세 읽기 전용·Sources 행)까지 잇는다(/ship 6.2).
 *
 * 규칙: 추가 제안(ADD)은 작업 대상이다. 제거 예정(REMOVE)은 작업에서 빠지되 Sources·번역 상세에 상태 행으로 남는다. 취소하면 돌아온다.
 * ⚠️ `pendingWhere`는 바꾸지 않는다(design §1) — 미전달 셀 수는 이 판정과 무관하다.
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPrisma: () => db.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-work-"));
let binaries: string;
const PORT = 55703;
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
  db.prisma = prisma;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const OWNER = { userId: "owner" };
const WEB = { slug: "p", surfaceSlug: "web" };

/**
 * en(base, 값 둘) · ko(hello만, 검토 대기) · ja(값 없음 — 빈 언어 항목). 첫 적재가 끝난 소스다(검색은 `lastCommitSha`를 본다).
 */
beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.project.create({ data: { id: "p", slug: "p", name: "P", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main", pushTokenHash: hashPushToken("locale-work-fixture") } });
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.projectMember.create({ data: { projectId: "p", userId: "owner", role: "OWNER" } });
  await prisma.translationSurface.create({ data: { id: "s-web", projectId: "p", slug: "web", adapterName: "json-catalog", pathTemplate: "web/{locale}.json", baseLocale: "en", lastCommitSha: "sha" } });
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s-web" } });
  for (const code of ["en", "ko", "ja"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code, name: code, isBase: code === "en" } });
  for (const key of ["hello", "bye"]) {
    await prisma.stringKey.create({ data: { id: `k-${key}`, projectId: "p", surfaceId: "s-web", key, namespace: "", sourceText: key, sourceHash: key } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: `k-${key}`, localeCode: "en", value: key } });
  }
  await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "k-hello", localeCode: "ko", value: "annyeong-ko", needsReview: true } });
});

async function remove(localeCode: string) {
  const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode });
  if (!preview.ok) throw new Error(`preview refused: ${preview.error}`);
  const result = await removeLocale(prisma, OWNER, { ...WEB, localeCode, approval: preview.approval });
  if (!result.ok) throw new Error(`remove refused: ${result.error}`);
}

/** 화면이 읽는 뷰 모델 — DB 행이 아니라 이 출력이 끝 단언이다. */
async function views() {
  const aggregates = await loadProjectListAggregates(prisma, ["p"]);
  // 목록 집계 ①의 작업 언어 — 진행 막대가 Sources 소스 행으로 옮겨 간 뒤에도 같은 집합이 행 메타·할 일의 재료다.
  const progress = aggregates.locales.filter(locale => locale.projectId === "p");
  const inbox = await loadAttentionInbox(prisma, "owner");
  const items = inbox.groups.flatMap(group => group.items);
  const list = await loadTranslationList(prisma, { projectId: "p", routeSurfaceId: "s-web", query: DEFAULT_TRANSLATION_QUERY, pageSize: "all" });
  const tree = await loadTranslationTree(prisma, "p");
  const detail = await loadTranslationDetail(prisma, { projectId: "p", surfaceId: "s-web", keyId: "k-hello" });
  const sources = await loadSources(prisma, en, "p", "OWNER");
  const source = await loadSource(prisma, en, "p", "s-web", "OWNER");
  return {
    progress: progress.map(row => row.code).sort(),
    review: (await loadReviewAttention(prisma, ["p"])).map(row => row.localeCode),
    neverFilled: items.flatMap(item => (item.kind === "never_filled" ? [item.code] : [])).sort(),
    inboxReview: items.flatMap(item => (item.kind === "review" ? [item.code] : [])),
    search: (await searchKeys(prisma, { userId: "owner", q: "annyeong", activeSlug: null })).map(hit => hit.key),
    listTotals: list.rows.map(row => [row.key, row.totalLocales, row.missingCount]),
    treeLocales: tree.surfaces[0]?.locales,
    detail: detail.status === "ok" ? detail.locales.map(locale => [locale.code, locale.readOnly]) : null,
    surfaceCounts: (await loadSurfaceCounts(prisma, "p")).map(row => row.locales),
    sourceRow: sources?.sources.map(row => ({ locales: row.locales, progress: row.progress })),
    languages: source?.languages.map(row => ({ code: row.code, change: row.change?.operation ?? null, unsent: row.unsent })),
    sourceLocales: source?.locales,
    localeDelivery: source?.localeDelivery,
  };
}

describe("언어 상태와 집계", () => {
  it("평소 — 활성 언어 셋이 모든 집계의 작업 대상이다", async () => {
    expect(await views()).toEqual({
      progress: ["en", "ja", "ko"],
      review: ["ko"],
      neverFilled: ["ja"],
      inboxReview: ["ko"],
      search: ["hello"],
      listTotals: [["bye", 3, 2], ["hello", 3, 1]],
      treeLocales: ["en", "ja", "ko"],
      detail: [["en", false], ["ja", false], ["ko", false]],
      surfaceCounts: [3],
      sourceRow: [{ locales: 3, progress: { total: 6, done: 2, review: 1, percent: 33 } }],
      languages: [{ code: "en", change: null, unsent: false }, { code: "ja", change: null, unsent: false }, { code: "ko", change: null, unsent: false }],
      sourceLocales: 3,
      localeDelivery: "confirmed",
    });
  });

  it("추가 제안은 작업 대상이고, 제거 예정은 작업에서 빠지되 상태 행이 남는다 — 취소하면 돌아온다", async () => {
    const added = await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    expect(added).toMatchObject({ ok: true, action: "create" });
    await remove("ko");
    await remove("ja");

    expect(await views()).toEqual({
      progress: ["en", "fr"],
      review: [],
      neverFilled: ["fr"],
      inboxReview: [],
      search: [],
      listTotals: [["bye", 2, 1], ["hello", 2, 1]],
      treeLocales: ["en", "fr"],
      // 번역 상세는 제거 예정 언어를 읽기 전용으로 싣는다(셀 얼리기의 재료). 추가 제안은 편집 가능하다.
      detail: [["en", false], ["fr", false], ["ja", true], ["ko", true]],
      surfaceCounts: [2],
      sourceRow: [{ locales: 2, progress: { total: 4, done: 2, review: 0, percent: 50 } }],
      // 값 0개 ADD는 파일을 내지 않으므로 Unsent가 아니다. 제거 요청은 아직 전달되지 않아 Unsent다.
      languages: [
        { code: "en", change: null, unsent: false },
        { code: "fr", change: "ADD", unsent: false },
        { code: "ja", change: "REMOVE", unsent: true },
        { code: "ko", change: "REMOVE", unsent: true },
      ],
      sourceLocales: 2,
      localeDelivery: "confirmed",
    });

    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: false });
    const restored = await views();
    expect(restored.progress).toEqual(["en", "fr", "ko"]);
    expect(restored.review).toEqual(["ko"]);
    expect(restored.inboxReview).toEqual(["ko"]);
    expect(restored.search).toEqual(["hello"]);
    expect(restored.listTotals).toEqual([["bye", 3, 2], ["hello", 3, 1]]);
    expect(restored.detail).toEqual([["en", false], ["fr", false], ["ja", true], ["ko", false]]);
    expect(restored.languages?.find(row => row.code === "ko")).toEqual({ code: "ko", change: null, unsent: false });
  });

  it("값이 생긴 추가 제안은 Unsent이고, 무효화된 확인은 'unconfirmed'로 읽힌다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "k-hello", localeCode: "fr", value: "bonjour" } });
    const run = await prisma.syncRun.create({ data: { projectId: "p", status: "FAILED", trigger: "MANUAL", startedAt: new Date(Date.now() - 600_000), finishedAt: new Date(Date.now() - 590_000) } });
    await prisma.deliveryConfirmation.create({ data: { projectId: "p", surfaceId: "s-web", revision: "r1", syncRunId: run.id, contextFingerprint: "", invalidatedAt: new Date() } });
    const view = await views();
    expect(view.languages?.find(row => row.code === "fr")).toEqual({ code: "fr", change: "ADD", unsent: true });
    expect(view.localeDelivery).toBe("unconfirmed");
  });

  /**
   * 목록 검색 하이라이트(`matchesFor`, R-C1 🟡2). 행은 작업 언어 값으로 일치했는데 코드순 첫 일치 셀이 제거 예정 언어면, 하이라이트가 화면에서
   * 편집할 수 없는 값을 가리킨다. 하이라이트도 작업 언어 셀에서만 고른다.
   */
  it("목록 검색의 일치 조각은 제거 예정 언어 값을 고르지 않는다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "pt", name: "pt" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "k-hello", localeCode: "pt", value: "annyeong-pt" } });
    const search = () => loadTranslationList(prisma, { projectId: "p", routeSurfaceId: "s-web", query: { ...DEFAULT_TRANSLATION_QUERY, q: "annyeong" }, pageSize: "all" });
    // 대조: 평소에는 코드순 첫 일치(ko)가 하이라이트다.
    expect((await search()).rows.map(row => [row.key, row.match?.localeCode])).toEqual([["hello", "ko"]]);
    await remove("ko");
    expect((await search()).rows.map(row => [row.key, row.match?.field, row.match?.localeCode, row.match?.text])).toEqual([["hello", "translation", "pt", "annyeong-pt"]]);
  });

  it("orphan 언어는 상세에도 작업에도 없다", async () => {
    await prisma.locale.update({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-web", code: "ja" } }, data: { orphaned: true } });
    const view = await views();
    expect(view.detail).toEqual([["en", false], ["ko", false]]);
    expect(view.progress).toEqual(["en", "ko"]);
    expect(view.neverFilled).toEqual([]);
  });
});
