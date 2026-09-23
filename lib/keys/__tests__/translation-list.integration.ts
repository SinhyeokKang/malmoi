import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import {
  loadTranslationDetail,
  loadTranslationList,
  loadTranslationTree,
  resolveKeyIdByName,
} from "@/lib/keys/translation-list";
import { DEFAULT_TRANSLATION_QUERY, type TranslationQuery } from "@/lib/translations/query";
import { keyMatches, orderKeySummaries, summarizeKey } from "@/lib/translations/summary";

/**
 * **번역 목록·트리·상세 조회** (translation-rework T9 — spec §3.2·§3.3 · design §2 · §10.2).
 *
 * SQL 집계가 순수 oracle(`summarizeKey`·`keyMatches`·`orderKeySummaries`)과 **같은 키·셀을 센다** — 같은 fixture에서 대조한다.
 * 규칙: 분모 = 그 소스의 활성 로케일 · 결측 = 행 부재/빈 값 · review는 값이 있을 때만 · pending은 `pendingWhere`와 같은 셀 ·
 * orphan 키·로케일·보관 소스는 목록과 집계에서 빠진다 · 설명만 맞는 키는 검색 결과가 아니다 · 다른 테넌트 데이터는 0.
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-translation-list-"));
let binaries: string;
const PORT = 55499;
let pool: Pool;
let prisma: PrismaClient;
let started = false;
const PULLED = new Date("2026-09-20T00:00:00Z");

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});

type CellSeed = [locale: string, value: string, opts?: { review?: boolean; pending?: boolean }];
type KeySeed = { id: string; key: string; ns: string; source: string; description?: string; sort?: number; orphaned?: boolean; created?: Date; cells: CellSeed[] };

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await project("p", PULLED);
  // web: en(base)·ko·ja + orphan 로케일 fr. app: en(base)·ko.
  await surface("p", "web", ["en", "ko", "ja"], ["fr"]);
  await surface("p", "app", ["en", "ko"]);
  await keys("p", "web", [
    { id: "w1", key: "common.save", ns: "common", source: "Save", sort: 0, cells: [["en", "Save"], ["ko", "저장"], ["ja", "保存"]] },
    { id: "w2", key: "common.cancel", ns: "common", source: "Cancel", sort: 1, cells: [["en", "Cancel"], ["ko", "취소", { review: true }], ["ja", "キャンセル"]] },
    { id: "w3", key: "common.empty", ns: "common", source: "Nothing here", sort: 2, cells: [["en", "Nothing here"], ["ko", ""], ["fr", "Rien", { pending: true }]] },
    { id: "w4", key: "auth.login", ns: "auth", source: "Log in 100%_done", sort: 0, created: new Date("2026-09-21T00:00:00Z"), cells: [["en", "Log in 100%_done"], ["ko", "로그인", { pending: true }]] },
    { id: "w5", key: "auth.hint", ns: "auth", source: "Hint", description: "zebra only in description", sort: 1, cells: [["en", "Hint"], ["ko", "힌트"], ["ja", "ヒント"]] },
    { id: "w6", key: "auth.old", ns: "auth", source: "Old", orphaned: true, cells: [["en", "Old"]] },
    { id: "w7", key: "auth.unsorted", ns: "auth", source: "Unsorted", cells: [["en", "Unsorted"], ["ko", "정렬 없음"], ["ja", "", { review: true }]] },
  ]);
  await keys("p", "app", [
    { id: "a1", key: "app.title", ns: "app", source: "Title", sort: 0, cells: [["en", "Title"], ["ko", "제목"]] },
    { id: "a2", key: "app.body", ns: "app", source: "Body", sort: 1, cells: [["en", "Body"]] },
  ]);
  // 다른 테넌트 — 같은 이름·같은 문장. 어느 결과에도 나오면 안 된다.
  await project("q", PULLED);
  await surface("q", "web", ["en", "ko"]);
  await keys("q", "web", [{ id: "q1", key: "common.save", ns: "common", source: "Save", sort: 0, cells: [["en", "Save"]] }]);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

async function project(id: string, lastPulledAt: Date | null) {
  await prisma.project.create({ data: { id, slug: id, name: id, repoOwner: "o", repoName: id, baseBranch: "main", installationId: "1", lastPulledAt } });
}
async function surface(p: string, slug: string, locales: string[], orphanLocales: string[] = []) {
  await prisma.translationSurface.create({ data: { id: `${p}-${slug}`, projectId: p, slug, adapterName: "json-catalog", pathTemplate: `${slug}/{locale}.json`, nested: false, baseLocale: "en", lastCommitSha: "c1" } });
  await prisma.locale.createMany({ data: [...locales.map(code => ({ code, orphaned: false })), ...orphanLocales.map(code => ({ code, orphaned: true }))]
    .map(l => ({ projectId: p, surfaceId: `${p}-${slug}`, code: l.code, name: l.code, isBase: l.code === "en", orphaned: l.orphaned })) });
}
async function keys(p: string, slug: string, seeds: KeySeed[]) {
  for (const k of seeds) {
    await prisma.stringKey.create({ data: {
      id: k.id, projectId: p, surfaceId: `${p}-${slug}`, key: k.key, namespace: k.ns, sourceText: k.source, sourceHash: k.id,
      description: k.description ?? null, sortIndex: k.sort ?? null, orphaned: k.orphaned ?? false, createdAt: k.created ?? new Date("2026-09-01T00:00:00Z"),
    } });
    for (const [locale, value, opts] of k.cells) {
      await prisma.translation.create({ data: {
        id: `${k.id}-${locale}`, projectId: p, surfaceId: `${p}-${slug}`, keyId: k.id, localeCode: locale, value,
        needsReview: opts?.review ?? false, pendingEditToken: opts?.pending ? `tok-${k.id}-${locale}` : null,
      } });
    }
  }
}

/** oracle — DB 행을 그대로 읽어 순수 함수로 판정한다. 순서는 파일 순서(sortIndex NULLS LAST → key 코드 단위) 뒤 안정 분할. */
async function oracle(surfaceIds: string[], filter: Parameters<typeof keyMatches>[1], ns?: string) {
  const surfaces = await prisma.translationSurface.findMany({ where: { id: { in: surfaceIds } }, orderBy: { slug: "asc" }, include: { locales: true } });
  const out: { keyId: string; missingCount: number; hasReview: boolean; hasPending: boolean; totalLocales: number }[] = [];
  for (const s of surfaces) {
    const active = s.locales.filter(l => !l.orphaned).map(l => l.code);
    if (filter.completion === "missing" && !active.includes(filter.missingLocale ?? "")) continue;
    const rows = await prisma.stringKey.findMany({ where: { surfaceId: s.id, orphaned: false, ...(ns ? { namespace: ns } : {}) }, include: { translations: true } });
    rows.sort((a, b) => (a.sortIndex ?? Infinity) - (b.sortIndex ?? Infinity) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const k of rows) {
      const cells = k.translations.map(t => ({ localeCode: t.localeCode, value: t.value, needsReview: t.needsReview, pending: t.pendingEditToken !== null }));
      const summary = summarizeKey({ activeLocales: active, cells });
      const missingLocales = active.filter(code => { const c = cells.find(x => x.localeCode === code); return c === undefined || c.value === ""; });
      if (keyMatches({ summary, missingLocales, createdAt: k.createdAt }, filter, { lastPulledAt: PULLED })) out.push({ keyId: k.id, ...summary });
    }
  }
  return orderKeySummaries(out);
}

const q = (over: Partial<TranslationQuery>): TranslationQuery => ({ ...DEFAULT_TRANSLATION_QUERY, ...over });
const list = (query: TranslationQuery, pageSize?: number) => loadTranslationList(prisma, { projectId: "p", routeSurfaceId: "p-web", query, pageSize });

describe("loadTranslationTree", () => {
  it("활성 키만 센다 — 프로젝트 · 소스 · 네임스페이스", async () => {
    const tree = await loadTranslationTree(prisma, "p");
    expect(tree.projectKeyCount).toBe(8);
    expect(tree.surfaces.map(s => ({ slug: s.slug, keyCount: s.keyCount, namespaces: s.namespaces, locales: s.locales, baseLocale: s.baseLocale }))).toEqual([
      { slug: "app", keyCount: 2, namespaces: [{ name: "app", keyCount: 2 }], locales: ["en", "ko"], baseLocale: "en" },
      { slug: "web", keyCount: 6, namespaces: [{ name: "auth", keyCount: 3 }, { name: "common", keyCount: 3 }], locales: ["en", "ja", "ko"], baseLocale: "en" },
    ]);
  });
});

describe("loadTranslationList — oracle 대조", () => {
  it("This source: 행·순서·집계가 oracle과 같다", async () => {
    const result = await list(q({}));
    const expected = await oracle(["p-web"], { completion: "all" });
    expect(result.rows.map(r => ({ keyId: r.keyId, missingCount: r.missingCount, hasReview: r.hasReview, hasPending: r.hasPending, totalLocales: r.totalLocales })))
      .toEqual(expected.map(e => ({ keyId: e.keyId, missingCount: e.missingCount, hasReview: e.hasReview, hasPending: e.hasPending, totalLocales: e.totalLocales })));
    expect(result.matchedKeyCount).toBe(6);
    expect(result.incompleteKeyCount).toBe(expected.filter(e => e.missingCount > 0).length);
  });

  it("orphan 로케일의 pending 셀은 pending이 아니고, orphan 키는 목록에 없다", async () => {
    const rows = (await list(q({}))).rows;
    expect(rows.find(r => r.keyId === "w3")?.hasPending).toBe(false);
    expect(rows.map(r => r.keyId)).not.toContain("w6");
  });

  it("This namespace는 그 네임스페이스만, All sources는 두 소스를 소스 순으로 합친다", async () => {
    expect((await list(q({ scope: "namespace", ns: "auth" }))).rows.map(r => r.keyId)).toEqual((await oracle(["p-web"], { completion: "all" }, "auth")).map(e => e.keyId));
    const project = await list(q({ scope: "project" }));
    expect(project.rows.map(r => r.keyId)).toEqual((await oracle(["p-app", "p-web"], { completion: "all" })).map(e => e.keyId));
    expect(project.rows.find(r => r.keyId === "a2")).toMatchObject({ surfaceSlug: "app", namespace: "app", totalLocales: 2, missingCount: 1 });
  });

  it("This namespace인데 네임스페이스가 전체(*)면 This source와 같다 — `*`라는 이름을 찾아 0건이 되지 않는다", async () => {
    expect((await list(q({ scope: "namespace" }))).rows.map(r => r.keyId)).toEqual((await list(q({}))).rows.map(r => r.keyId));
  });

  it.each([
    ["incomplete", { completion: "incomplete" as const }],
    ["complete", { completion: "complete" as const }],
    ["unsent", { completion: "all" as const, state: "unsent" as const }],
    ["review", { completion: "all" as const, state: "review" as const }],
    ["new", { completion: "all" as const, state: "new" as const }],
    ["incomplete+review", { completion: "incomplete" as const, state: "review" as const }],
  ])("필터 %s가 oracle과 같다 (All sources)", async (_name, filter) => {
    const result = await list(q({ scope: "project", ...filter }));
    expect(result.rows.map(r => r.keyId)).toEqual((await oracle(["p-app", "p-web"], filter)).map(e => e.keyId));
  });

  it("Missing in ja는 ja가 없는 소스를 결과에서 뺀다", async () => {
    const result = await list(q({ scope: "project", completion: "missing", missingLocale: "ja" }));
    expect(result.rows.map(r => r.keyId)).toEqual((await oracle(["p-web"], { completion: "missing", missingLocale: "ja" })).map(e => e.keyId));
    expect(result.effective).toMatchObject({ completion: "missing", excludedSurfaceIds: ["p-app"] });
  });

  it("ja가 없는 단일 소스로 좁히면 Incomplete로 대체하고 그 사실을 돌려준다", async () => {
    const result = await loadTranslationList(prisma, { projectId: "p", routeSurfaceId: "p-app", query: q({ completion: "missing", missingLocale: "ja" }) });
    expect(result.effective).toMatchObject({ completion: "incomplete", substituted: true });
    expect(result.rows.map(r => r.keyId)).toEqual(["a2"]);
  });

  it("New from GitHub는 lastPulledAt 이후 생성된 키다", async () => {
    expect((await list(q({ state: "new" }))).rows.map(r => r.keyId)).toEqual(["w4"]);
    expect((await list(q({}))).rows.find(r => r.keyId === "w4")?.isNew).toBe(true);
  });
});

describe("loadTranslationList — 검색", () => {
  it("키 이름·원문·활성 로케일 저장 번역을 대소문자 무시로 찾는다", async () => {
    expect((await list(q({ q: "CANCEL" }))).rows.map(r => r.keyId)).toEqual(["w2"]);
    expect((await list(q({ q: "nothing" }))).rows.map(r => r.keyId)).toEqual(["w3"]);
    expect((await list(q({ q: "로그인" }))).rows.map(r => r.keyId)).toEqual(["w4"]);
  });

  it("설명에만 있는 문자열은 결과가 아니다", async () => {
    expect((await list(q({ q: "zebra" }))).rows).toEqual([]);
  });

  it("orphan 로케일의 값으로는 찾지 않는다", async () => {
    expect((await list(q({ q: "Rien" }))).rows).toEqual([]);
  });

  it("%·_는 문자 그대로다", async () => {
    expect((await list(q({ q: "100%_" }))).rows.map(r => r.keyId)).toEqual(["w4"]);
    expect((await list(q({ q: "%" }))).rows.map(r => r.keyId)).toEqual(["w4"]);
    expect((await list(q({ q: "_" }))).rows.map(r => r.keyId)).toEqual(["w4"]);
  });

  it("일치 조각은 어느 필드·언어인지와 범위를 준다 — HTML이 아니다", async () => {
    const row = (await list(q({ q: "로그" }))).rows[0];
    expect(row?.match).toEqual({ field: "translation", localeCode: "ko", text: "로그인", start: 0, length: 2 });
    const byKey = (await list(q({ q: "cancel" }))).rows[0];
    expect(byKey?.match).toMatchObject({ field: "key", text: "common.cancel", start: 7, length: 6 });
  });

  it("다른 테넌트의 같은 문장은 나오지 않는다", async () => {
    const result = await list(q({ scope: "project", q: "Save" }));
    expect(result.rows.map(r => r.keyId)).toEqual(["w1"]);
  });
});

describe("loadTranslationList — 페이지", () => {
  it("작은 페이지를 이어 붙이면 전체와 같고 중복이 없다", async () => {
    const full = (await list(q({ scope: "project" }))).rows.map(r => r.keyId);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await list(q({ scope: "project", ...(cursor === undefined ? {} : { cursor }) }), 3);
      seen.push(...page.rows.map(r => r.keyId));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(full);
  });

  it("알 수 없는 cursor는 첫 페이지다 — 조작된 값으로 범위를 넓히지 않는다", async () => {
    expect((await list(q({ cursor: "not-a-cursor" }))).rows.map(r => r.keyId)).toEqual((await list(q({}))).rows.map(r => r.keyId));
  });
});

describe("loadTranslationDetail", () => {
  it("선택 키의 활성 언어를 base 우선 · 코드순으로 싣고 pending은 boolean이다", async () => {
    const detail = await loadTranslationDetail(prisma, { projectId: "p", surfaceId: "p-web", keyId: "w3" });
    expect(detail.status).toBe("ok");
    if (detail.status !== "ok") return;
    expect(detail.key).toMatchObject({ id: "w3", key: "common.empty", sourceText: "Nothing here", surfaceSlug: "web" });
    expect(detail.locales.map(l => [l.code, l.isBase, l.value, l.pending])).toEqual([
      ["en", true, "Nothing here", false], ["ja", false, null, false], ["ko", false, "", false],
    ]);
    expect(JSON.stringify(detail)).not.toContain("tok-");
  });

  it("orphan 키·다른 프로젝트·다른 표면의 키는 부재다", async () => {
    expect(await loadTranslationDetail(prisma, { projectId: "p", surfaceId: "p-web", keyId: "w6" })).toEqual({ status: "absent" });
    expect(await loadTranslationDetail(prisma, { projectId: "p", surfaceId: "p-web", keyId: "q1" })).toEqual({ status: "absent" });
    expect(await loadTranslationDetail(prisma, { projectId: "p", surfaceId: "p-app", keyId: "w1" })).toEqual({ status: "absent" });
  });
});

describe("resolveKeyIdByName — Logs의 옛 사건이 가리키는 키", () => {
  it("인가된 프로젝트·소스 slug·키 이름으로 현재 id를 찾는다", async () => {
    expect(await resolveKeyIdByName(prisma, { projectId: "p", surfaceSlug: "web", key: "common.save" })).toBe("w1");
    expect(await resolveKeyIdByName(prisma, { projectId: "p", surfaceSlug: "web", key: "auth.old" })).toBeNull();
    expect(await resolveKeyIdByName(prisma, { projectId: "q", surfaceSlug: "app", key: "app.title" })).toBeNull();
  });
});
