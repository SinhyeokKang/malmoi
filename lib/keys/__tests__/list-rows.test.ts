import { describe, expect, it } from "vitest";

import { projectSyncFailure } from "@/lib/projects/list";

import { assembleProjectListRows, type ProjectListAggregates, type ProjectListMemberRow } from "../query";

/**
 * **목록 행 조립** (ux-drift-unify §3.2 · 🔴 E). 결함은 판정이 아니라 조립에 있었다 — 표면을 `find`(첫 실패 코드) ·
 * `some`(하나라도 동기화 중)으로 평탄화해, 표면 A가 동기화 중이면 표면 B의 실패가 통째로 가려졌다.
 * 조립은 I/O가 없으므로 여기서 칩·띠까지 이어서 센다(POSTMORTEM 2026-09-20 — 판정만 통과하고 조립에서 사실이 달라졌다).
 */

const EMPTY: ProjectListAggregates = { locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map(), unsentSurfaces: new Map(), unsentAt: new Map(), newKeysBySurface: new Map(), unsentBySurface: new Map() };
const surface = (over: Partial<ProjectListMemberRow["project"]["surfaces"][number]> = {}) =>
  ({ id: "s1", slug: "web", locales: [], lastImportFailedAt: null, lastImportedAt: null, lastCommitAt: null, archivedAt: null, lastCommitSha: "sha", lastImportError: null, lastImportStartedAt: null, ...over });
const member = (surfaces: ProjectListMemberRow["project"]["surfaces"], over: Partial<ProjectListMemberRow["project"]> = {}): ProjectListMemberRow => ({
  role: "OWNER",
  project: {
    id: "p1", createdAt: new Date(0), slug: "acme", name: "Acme", image: null, repoHost: "github", gitlabConnectionId: null, installationId: "1", archivedAt: null, repoOwner: "o", repoName: "r",
    repositoryId: "10", baseBranch: "main", lastPrUrl: null, _count: { members: 1 }, surfaces, ...over,
  },
});
const assemble = (row: ProjectListMemberRow) => {
  const [assembled] = assembleProjectListRows([row], EMPTY, new Map(), new Map());
  if (assembled === undefined) throw new Error("no row");
  return assembled;
};

describe("assembleProjectListRows — 표면을 평탄화하지 않는다", () => {
  it("표면마다 적재 상태를 싣는다 — 모르는 코드는 버린다", () => {
    const row = assemble(member([
      surface({ lastImportStartedAt: new Date(0) }),
      surface({ lastImportError: "parse-failed" }),
      surface({ lastImportError: "constructor" }),
    ]));
    expect(row.surfaces.map(({ importError, importing }) => ({ importError, importing }))).toEqual([
      { importError: null, importing: true },
      { importError: "parse-failed", importing: false },
      { importError: null, importing: false },
    ]);
  });

  it("A 동기화 중 + B 실패 → 칩·띠 모두 실패다", () => {
    const row = assemble(member([surface({ lastImportStartedAt: new Date(0) }), surface({ lastImportError: "parse-failed" })]));
    expect(projectSyncFailure(row.surfaces)).toBe("parse-failed");
    expect(row.plan).toEqual({ chip: "syncFailed", group: "needs_attention", banner: { kind: "import_failed", reason: "parse-failed" } });
  });

  it("A partial + B failed → failed(빨강)다 — slug 순의 첫 코드가 아니다", () => {
    const row = assemble(member([surface({ lastImportError: "partial-import" }), surface({ lastImportError: "import-failed" })]));
    expect(row.plan).toEqual({ chip: "syncFailed", group: "needs_attention", banner: { kind: "import_failed", reason: "import-failed" } });
  });

  it("리포 id가 없으면 실패가 있어도 칩·띠 모두 Disconnected다", () => {
    const row = assemble(member([surface({ lastImportError: "import-failed" })], { repositoryId: null }));
    expect(row.plan).toEqual({ chip: "disconnected", group: "needs_attention", banner: { kind: "needs_reconnect" } });
  });
});

/**
 * **④ 조립이 "모름"을 보존한다** (ux-drift-unify Q6) — 전에는 `remote.get(...)?.openPr ?? null`이 `undefined`(확인 못 함)를 "없음"으로 접어
 * 앞의 세 경로가 삼상태를 지켜도 목록 띠가 사라졌다.
 */
describe("assembleProjectListRows — 열린 PR 삼상태", () => {
  const PR = { number: 7, url: "https://github.com/o/r/pull/7" };
  it.each([
    ["모름", { openPr: undefined, repoAheadFiles: 0 }, undefined],
    ["없음", { openPr: null, repoAheadFiles: 0 }, null],
    ["열림", { openPr: PR, repoAheadFiles: 0 }, PR],
  ] as const)("%s를 그대로 싣는다", (_label, signals, expected) => {
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map([["p1", signals]]), new Map());
    expect(row?.openPr).toEqual(expected);
    expect(row !== undefined && "openPr" in row).toBe(true);
  });

  it("원격 결과에 행이 없으면 없음이다", () => {
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map(), new Map());
    expect(row?.openPr).toBeNull();
  });

  it("모름이면 띠가 Couldn't check다", () => {
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map([["p1", { openPr: undefined, repoAheadFiles: 0 }]]), new Map());
    if (row === undefined) throw new Error("no row");
    expect(row.plan).toEqual({ chip: "active", group: "all_set", banner: { kind: "pr_check_failed" } });
  });
});

describe("assembleProjectListRows — 대표 메타", () => {
  it("첫 적재 전 소스도 세고 키는 로케일 수와 무관하게 표면별로 한 번 센다", () => {
    const surfaces = [surface({ id: "s1", slug: "web" }), surface({ id: "s2", slug: "app", lastCommitSha: null }),
      surface({ id: "old", slug: "old", archivedAt: new Date(0) })];
    const aggregates = { ...EMPTY,
      keyTotals: new Map([["s1", 4], ["s2", 2], ["old", 100], ["other-project", 200]]),
      locales: [
        { projectId: "p1", surfaceId: "s1", surfaceSlug: "web", code: "en", isBase: true },
        { projectId: "p1", surfaceId: "s1", surfaceSlug: "web", code: "ko", isBase: false },
        { projectId: "p1", surfaceId: "s2", surfaceSlug: "app", code: "ko", isBase: true },
        { projectId: "p1", surfaceId: "s2", surfaceSlug: "app", code: "en", isBase: false },
        { projectId: "p1", surfaceId: "s2", surfaceSlug: "app", code: "es", isBase: false },
        { projectId: "p1", surfaceId: "old", surfaceSlug: "old", code: "de", isBase: false },
        { projectId: "p2", surfaceId: "other-project", surfaceSlug: "else", code: "fr", isBase: false },
      ],
    };
    const [row] = assembleProjectListRows([member(surfaces)], aggregates, new Map(), new Map());
    expect(row).toMatchObject({ sourceCount: 2, keyCount: 6, languageCount: 3 });
  });

  it.each([
    ["미적재", [surface({ lastCommitSha: null })], null],
    ["시각 기록 이전 적재", [surface({ lastCommitAt: new Date(0) })], "unrecorded"],
    ["마지막 성공 시각", [surface({ lastImportedAt: new Date("2026-10-01T00:00:00Z") }),
      surface({ lastImportedAt: new Date("2026-10-02T00:00:00Z") }),
      surface({ archivedAt: new Date(0), lastImportedAt: new Date("2026-10-03T00:00:00Z") })], "2026-10-02T00:00:00.000Z"],
  ])("동기화: %s", (_label, surfaces, expected) => {
    expect(assemble(member(surfaces)).lastSync).toBe(expected);
  });

  it("작업 로케일 집합에 없는 orphaned·REMOVE는 빼고 ADD는 센다", () => {
    // 집계 ①이 workLocaleWhere로 고른 집합이다. DB 술어는 통합 테스트가 함께 검증한다.
    const [row] = assembleProjectListRows([member([surface({ id: "s1" })])], {
      ...EMPTY, keyTotals: new Map([["s1", 2]]),
      locales: [{ projectId: "p1", surfaceId: "s1", surfaceSlug: "web", code: "added", isBase: false }],
      cells: [{ projectId: "p1", surfaceId: "s1", localeCode: "orphaned", needsReview: true, count: 9 }],
    }, new Map(), new Map());
    expect(row).toMatchObject({ keyCount: 2, languageCount: 1, review: 0 });
  });
});

describe("assembleProjectListRows — DB 할 일", () => {
  const at = new Date("2026-10-01T00:00:00Z");
  const locales = [
    { code: "ko", name: "Korean", orphaned: false, createdAt: at, change: { operation: "ADD" as const } },
    { code: "es", name: "Spanish", orphaned: false, createdAt: at, change: { operation: "REMOVE" as const } },
  ];
  it("로케일 정보와 기존 집계로 빈 ADD를 싣고 REMOVE를 뺀다", () => {
    const [row] = assembleProjectListRows([member([surface({ id: "s1", locales })])], {
      ...EMPTY, keyTotals: new Map([["s1", 2]]),
      locales: [{ projectId: "p1", surfaceId: "s1", surfaceSlug: "web", code: "ko", isBase: false }],
    }, new Map(), new Map());
    // 행은 판정 결과만 싣는다(RA 🟢3) — 할 일 목록 전체가 아니라 띠 하나다.
    expect(row?.plan.banner).toEqual({ kind: "never_filled", surfaceSlug: "web", code: "ko", name: "Korean", keys: 2 });
    expect(row !== undefined && "todos" in row).toBe(false);
  });
  it("검토의 시각·저자를 만들지 않고 셀 수를 보존한다", () => {
    const [row] = assembleProjectListRows([member([surface({ id: "s1", locales })])], {
      ...EMPTY, keyTotals: new Map([["s1", 2]]),
      locales: [{ projectId: "p1", surfaceId: "s1", surfaceSlug: "web", code: "ko", isBase: false }],
      cells: [{ projectId: "p1", surfaceId: "s1", localeCode: "ko", needsReview: true, count: 2 },
        { projectId: "p1", surfaceId: "s1", localeCode: "es", needsReview: true, count: 9 }],
    }, new Map(), new Map());
    expect(row?.review).toBe(2);
    expect(row?.plan.banner).toEqual({ kind: "review", count: 2 });
  });
  // 할 일의 시각·소유자 플래그는 Inbox 몫이다(`project-todos.test.ts`) — 행에는 판정만 남는다.
  it("만료된 GitLab 토큰은 실패가 있어도 끊김 띠 하나다", () => {
    const row = assemble({ ...member([surface({ lastImportError: "parse-failed", lastImportFailedAt: at })], {
      repoHost: "gitlab", gitlabConnectionId: "c", gitlabConnection: { expiresAt: new Date(0) },
    }), role: "EDITOR" });
    expect(row.plan).toEqual({ chip: "disconnected", group: "needs_attention", banner: { kind: "needs_reconnect" } });
  });
});

/**
 * **검토 띠의 수와 링크 목적지가 한 집합에서 나온다** (RB 🟢1). `reviewSurfaceSlug`는 `rowReviewCells`가 낸 (표면, 로케일) 가운데 검토가 있는
 * 가장 작은 slug다 — 따로 셀을 거르면 띠는 "N개 검토"인데 링크는 그 셀이 없는 소스로 갈 수 있다.
 */
describe("assembleProjectListRows — 검토 띠의 목적지", () => {
  it("검토가 있는 작업 언어의 소스 중 가장 작은 slug이고, 작업 언어 밖의 셀은 목적지를 만들지 않는다", () => {
    const [row] = assembleProjectListRows([member([surface({ id: "s1", slug: "web" }), surface({ id: "s2", slug: "app" }), surface({ id: "s3", slug: "admin" })])], {
      ...EMPTY,
      locales: [
        { projectId: "p1", surfaceId: "s1", surfaceSlug: "web", code: "ko", isBase: false },
        { projectId: "p1", surfaceId: "s2", surfaceSlug: "app", code: "ko", isBase: false },
      ],
      cells: [
        { projectId: "p1", surfaceId: "s1", localeCode: "ko", needsReview: true, count: 2 },
        { projectId: "p1", surfaceId: "s2", localeCode: "ko", needsReview: false, count: 5 },
        // `admin`의 `ja`는 작업 언어가 아니다(orphaned·제거 예정) — 수에도 목적지에도 들지 않는다.
        { projectId: "p1", surfaceId: "s3", localeCode: "ja", needsReview: true, count: 9 },
      ],
    }, new Map(), new Map());
    expect(row).toMatchObject({ review: 2, reviewSurfaceSlug: "web" });
    expect(row?.plan.banner).toEqual({ kind: "review", count: 2 });
  });

  it("검토가 없으면 목적지도 없다", () => {
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map(), new Map());
    expect(row?.reviewSurfaceSlug).toBeNull();
  });
});
