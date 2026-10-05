import { describe, expect, it } from "vitest";

import { projectSyncFailure, rowBanner, rowChip } from "@/lib/projects/list";

import { assembleProjectListRows, type ProjectListAggregates, type ProjectListMemberRow } from "../query";

/**
 * **목록 행 조립** (ux-drift-unify §3.2 · 🔴 E). 결함은 판정이 아니라 조립에 있었다 — 표면을 `find`(첫 실패 코드) ·
 * `some`(하나라도 동기화 중)으로 평탄화해, 표면 A가 동기화 중이면 표면 B의 실패가 통째로 가려졌다.
 * 조립은 I/O가 없으므로 여기서 칩·띠까지 이어서 센다(POSTMORTEM 2026-09-20 — 판정만 통과하고 조립에서 사실이 달라졌다).
 */

const EMPTY: ProjectListAggregates = { locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map(), unsentSurfaces: new Map(), unsentAt: new Map(), newKeysBySurface: new Map(), unsentBySurface: new Map() };
const surface = (over: Partial<ProjectListMemberRow["project"]["surfaces"][number]> = {}) =>
  ({ archivedAt: null, lastCommitSha: "sha", lastImportError: null, lastImportStartedAt: null, ...over });
const member = (surfaces: ProjectListMemberRow["project"]["surfaces"], over: Partial<ProjectListMemberRow["project"]> = {}): ProjectListMemberRow => ({
  role: "OWNER",
  project: {
    id: "p1", slug: "acme", name: "Acme", image: null, installationId: "1", archivedAt: null, repoOwner: "o", repoName: "r",
    repositoryId: "10", baseBranch: "main", lastPrUrl: null, _count: { members: 1 }, surfaces, ...over,
  },
});
const assemble = (row: ProjectListMemberRow) => {
  const [assembled] = assembleProjectListRows([row], EMPTY, new Map());
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
    expect(rowChip(row)).toBe("sync_failed");
    expect(rowBanner(row)).toEqual({ kind: "import_failed", reason: "parse-failed" });
  });

  it("A partial + B failed → failed(빨강)다 — slug 순의 첫 코드가 아니다", () => {
    const row = assemble(member([surface({ lastImportError: "partial-import" }), surface({ lastImportError: "import-failed" })]));
    expect(rowChip(row)).toBe("sync_failed");
    expect(rowBanner(row)).toEqual({ kind: "import_failed", reason: "import-failed" });
  });

  it("리포 id가 없으면 실패가 있어도 칩·띠 모두 Disconnected다", () => {
    const row = assemble(member([surface({ lastImportError: "import-failed" })], { repositoryId: null }));
    expect(rowChip(row)).toBe("needs_reconnect");
    expect(rowBanner(row)).toEqual({ kind: "needs_reconnect" });
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
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map([["p1", signals]]));
    expect(row?.openPr).toEqual(expected);
    expect(row !== undefined && "openPr" in row).toBe(true);
  });

  it("원격 결과에 행이 없으면 없음이다", () => {
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map());
    expect(row?.openPr).toBeNull();
  });

  it("모름이면 띠가 Couldn't check다", () => {
    const [row] = assembleProjectListRows([member([surface()])], EMPTY, new Map([["p1", { openPr: undefined, repoAheadFiles: 0 }]]));
    if (row === undefined) throw new Error("no row");
    expect(rowBanner(row)).toEqual({ kind: "pr_check_failed" });
  });
});
