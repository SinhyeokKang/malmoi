import { describe, expect, it } from "vitest";

import { stateLabel } from "@/lib/status/canon";
import { projectTodos } from "@/lib/inbox/project-todos";
import { en } from "@/messages/en";

import {
  planProjectRow,
  groupProjects,
  listBody,
  projectStatus,
  projectSyncFailure,
  reviewByLocale,
  rowReviewCells,
  searchProjects,
  summaryQueue,
  type ProjectRowPlan,
  type ProjectStatus,
  type ProjectStatusInput,
  type RowInput,
} from "../list";

describe("searchProjects", () => {
  const rows = [
    { slug: "a", name: "BugShot Web" },
    { slug: "b", name: "말모이" },
    { slug: "c", name: "bugshot-extension" },
  ];

  it("빈 질의는 전부 낸다", () => {
    expect(searchProjects(rows, "").map((r) => r.slug)).toEqual(["a", "b", "c"]);
    expect(searchProjects(rows, undefined).map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  it("공백만 있는 질의도 전부 낸다", () => {
    expect(searchProjects(rows, "   ").map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  // 이름은 사용자가 정하고 질의는 주소창 값이라 대소문자를 맞출 수 없다.
  it("대소문자를 가리지 않고 부분 일치한다", () => {
    expect(searchProjects(rows, "bugshot").map((r) => r.slug)).toEqual(["a", "c"]);
    expect(searchProjects(rows, "SHOT").map((r) => r.slug)).toEqual(["a", "c"]);
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(searchProjects(rows, "  web  ").map((r) => r.slug)).toEqual(["a"]);
  });

  // search-ux-unify D1 — 검색·스위처와 같은 토큰 AND. 어순이 달라도 찾는다.
  it("여러 낱말은 각각 이름 안에 있으면 찾는다", () => {
    expect(searchProjects(rows, "web bugshot").map((r) => r.slug)).toEqual(["a"]);
    expect(searchProjects(rows, "web extension")).toEqual([]);
  });

  it("비ASCII 이름도 찾는다", () => {
    expect(searchProjects(rows, "말모").map((r) => r.slug)).toEqual(["b"]);
  });

  it("맞는 것이 없으면 빈 배열이다", () => {
    expect(searchProjects(rows, "zzz")).toEqual([]);
  });

  // ⚠️ 호출부가 같은 배열로 필터 전 총계를 센다 — 제자리에서 잘라내면 제목 옆 숫자가 흔들린다.
  it("원본을 건드리지 않는다", () => {
    const original = [...rows];
    searchProjects(rows, "bugshot");
    expect(rows).toEqual(original);
  });
});

describe("projectStatus — GitLab 저장 만료일 (D24)", () => {
  const NOW = new Date("2026-10-12T00:00:00Z");
  const GITLAB = { archivedAt: null, repoHost: "gitlab", installationId: null, gitlabConnectionId: "conn-a", surfaces: [{ archivedAt: null, lastCommitSha: "sha" }], repositoryId: "42" };
  it.each([
    ["만료일 없음", null, "active"],
    ["만료 임박(5일) — 연결은 정상이다", new Date("2026-10-17T00:00:00Z"), "active"],
    ["만료일 지남 — 원격 호출 없이 끊김", new Date("2026-10-11T00:00:00Z"), "needs_reconnect"],
  ] as const)("%s", (_name, expiresAt, status) => {
    expect(projectStatus({ ...GITLAB, gitlabTokenExpiresAt: expiresAt }, NOW)).toBe(status);
  });
  it("⚠️ 만료일 필드를 빠뜨린 입력은 typecheck가 막는다 — 새 생산자가 잊으면 만료된 프로젝트가 조용히 `active`다(audit E11)", () => {
    // @ts-expect-error -- `gitlabTokenExpiresAt`은 필수 `Date | null`이다. GitHub·연결 없음도 `null`을 명시한다.
    const input: ProjectStatusInput = GITLAB;
    expect(input).toBe(GITLAB);
  });
  it("GitHub 프로젝트는 GitLab 만료일을 보지 않는다", () => {
    expect(projectStatus({ ...GITLAB, repoHost: "github", installationId: "inst", gitlabConnectionId: null, gitlabTokenExpiresAt: new Date("2000-01-01T00:00:00Z") }, NOW)).toBe("active");
  });
});

describe("projectStatus", () => {
  const READY = { archivedAt: null, repoHost: "github", gitlabConnectionId: null, gitlabTokenExpiresAt: null, installationId: "1", surfaces: [{ archivedAt: null, lastCommitSha: "a".repeat(40) }], repositoryId: "42" };

  it("준비된 프로젝트는 `active`다 — 이 화면에서만 `ready`가 침묵이 아니다", () => {
    expect(projectStatus(READY)).toBe("active");
  });

  /**
   * ⚠️ **보관이 readiness보다 앞이다.** 멈춘 프로젝트에서 "첫 적재를 기다리는 중"은 답할 질문이
   * 아니다 — 순서를 뒤집으면 보관된 신규 프로젝트가 `Setting up`으로 보이고, 사용자는 그것을
   * 되돌리는 대신 온보딩을 고치러 간다.
   */
  it("보관이 readiness를 이긴다", () => {
    expect(projectStatus({ ...READY, archivedAt: new Date() })).toBe("archived");
    expect(
      projectStatus({ archivedAt: new Date(), repoHost: "github", gitlabConnectionId: null, gitlabTokenExpiresAt: null, installationId: null, surfaces: [{ archivedAt: null, lastCommitSha: null }], repositoryId: null }),
    ).toBe("archived");
  });

  it("연결 전은 `setup`, 첫 적재 전은 `awaiting_first_sync`다", () => {
    expect(projectStatus({ ...READY, installationId: null })).toBe("setup");
    expect(projectStatus({ ...READY, surfaces: [{ archivedAt: null, lastCommitSha: null }] })).toBe("awaiting_first_sync");
  });

  /**
   * ⚠️ **`repositoryId`는 readiness와 다른 축이다** (PRODUCT §7.5). sec-audit-2 이전에 만들어진 행이
   * 이것이고, 그 상태에서 **Publish만 조용히 거부된다** — 목록이 여태 `Active`를 보였다.
   */
  it("준비됐는데 리포가 고정 안 됐으면 `needs_reconnect`다", () => {
    expect(projectStatus({ ...READY, repositoryId: null })).toBe("needs_reconnect");
  });

  /**
   * ⚠️ **`ready`일 때만 본다.** 첫 적재조차 안 끝난 프로젝트에서 "다시 연결하라"는 답할 질문이
   * 아니다 — 순서를 뒤집으면 온보딩 중인 프로젝트가 전부 그 배지를 달고, 사용자가 갓 만든 것을
   * 고치러 간다.
   */
  it("readiness가 `needs_reconnect`보다 앞이다", () => {
    expect(projectStatus({ ...READY, installationId: null, repositoryId: null })).toBe("setup");
    expect(projectStatus({ ...READY, surfaces: [{ archivedAt: null, lastCommitSha: null }], repositoryId: null })).toBe("awaiting_first_sync");
  });

  /** 보관은 그 셋 전부를 이긴다. */
  it("보관이 `needs_reconnect`도 이긴다", () => {
    expect(projectStatus({ ...READY, archivedAt: new Date(), repositoryId: null })).toBe("archived");
  });
});

/**
 * 문구 — `readinessLabel`이 들던 방어선이 여기로 따라왔다.
 * **번역자도 이 목록을 보므로 내부 이름이 화면에 뜨면 안 된다** (PRODUCT §3).
 */
describe("상태 문구", () => {
  const ALL = [
    "active",
    "archived",
    "setup",
    "awaiting_first_sync",
    "needs_reconnect",
  ] as const satisfies readonly ProjectStatus[];

  type Missing = Exclude<ProjectStatus, (typeof ALL)[number]>;
  const _coversUnion: [Missing] extends [never] ? true : false = true;
  void _coversUnion;

  // 칩은 `planProjectRow`가 낸다 — 상태마다 대표 입력 하나로 칩 키를 얻는다(목록이 보이는 그 낱말이다).
  const chipOf = (status: ProjectStatus) => planProjectRow(row({
    archived: { archivedAt: new Date(0) }, setup: { installationId: null }, awaiting_first_sync: { surfaces: [FIRST] },
    needs_reconnect: { repositoryId: null }, active: {},
  }[status]), []).chip;

  it("갈래 다섯이 전부 문구를 갖는다", () => {
    for (const status of ALL) expect(stateLabel(en, chipOf(status))).toBeTruthy();
  });

  it("내부 이름을 흘리지 않는다 — 읽는 사람은 비개발자 동료다", () => {
    for (const status of ALL) {
      // 칩 낱말은 `STATE`가 든다(ux-drift-unify T19 — 칩이 상태 키만 넘긴다).
      const label = stateLabel(en, chipOf(status));
      expect(label).not.toContain(status);
      // snake_case는 우리 내부 이름의 모양이다 — en 라벨의 보통 낱말과 갈린다.
      expect(label).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it("다섯이 서로 다르다 — 한 문구로 접히면 상태를 구별할 수 없다", () => {
    expect(new Set(ALL.map((s) => stateLabel(en, chipOf(s)))).size).toBe(ALL.length);
  });
});

/**
 * **목록 재설계의 판정 여섯** (DESIGN §6.63). 전부 I/O가 없는 잎이고, 그래서
 * `components/__tests__/client-graph.test.ts`가 이 모듈을 클라이언트 번들 밖에 둔다.
 *
 * ⚠️ **캔버스 `1c`의 상태표가 정본이다** (DESIGN §6.63). 거기서 그대로 옮긴 표이고, 아래 매트릭스는 그 행과
 * 1:1이다 — 표에 없는 조합을 여기서 발명하지 않는다.
 */

/** 표면 하나의 적재 상태 — 행은 **표면 배열을 그대로** 든다(ux-drift-unify §3.2, 평탄화하면 A 동기화 중이 B 실패를 가렸다). */
const S = { archivedAt: null, lastCommitSha: "s", importError: null, importing: false } as const;
const FIRST = { ...S, lastCommitSha: null } as const;
const READY = { repoHost: "github", gitlabConnectionId: null, gitlabTokenExpiresAt: null, installationId: "i", surfaces: [S], repositoryId: "r", archivedAt: null } as const;
const QUIET = { review: 0, unsent: 0, openPr: null, repoAheadFiles: 0 } as const;
const row = (over: Partial<RowInput> = {}): RowInput => ({ ...READY, ...QUIET, ...over });
const failed = (importError: "parse-failed" | "partial-import" | "import-failed", importing = false) => ({ surfaces: [{ ...S, importError, importing }] });

/**
 * **표면별 `failing` 후 가장 나쁜 것 하나** (ux-drift-unify §3.2 · 🔴 E). 행을 평탄화하면(`find` · `some`) 표면 A가 동기화 중일 때
 * 표면 B의 실패가 통째로 가려졌고, partial이 slug 순으로 앞서면 failed가 호박으로 섰다.
 */
describe("projectSyncFailure", () => {
  const syncing = { importError: null, importing: true } as const;
  it.each([
    ["A 동기화 중 + B 실패 → B의 실패", [syncing, { importError: "parse-failed", importing: false }], "parse-failed"],
    ["A partial + B failed → failed", [{ importError: "partial-import", importing: false }, { importError: "import-failed", importing: false }], "import-failed"],
    ["A failed + B partial → failed", [{ importError: "import-failed", importing: false }, { importError: "partial-import", importing: false }], "import-failed"],
    ["partial 하나 → partial", [{ importError: "partial-import", importing: false }], "partial-import"],
    ["전부 동기화 중 → 없음", [syncing, { importError: "parse-failed", importing: true }], null],
    ["빈 배열 → 없음", [], null],
  ] as const)("%s", (_label, surfaces, expected) => {
    expect(projectSyncFailure(surfaces)).toBe(expected);
  });

  it("같은 급이면 먼저 온 표면(slug 순)의 코드다 — 결정적이다", () => {
    expect(projectSyncFailure([{ importError: "parse-failed", importing: false }, { importError: "import-failed", importing: false }])).toBe("parse-failed");
  });
});

/**
 * **`rowReviewCells` — 행의 `review` 합과 띠의 검토 할 일이 읽는 한 결과** (project-row-redesign RA 🟡). (표면, 로케일) 단위이고 살아 있는 로케일만이다.
 */
describe("rowReviewCells", () => {
  const locales = [
    { projectId: "p", surfaceId: "s1", surfaceSlug: "web", code: "ko", isBase: false },
    { projectId: "p", surfaceId: "s2", surfaceSlug: "app", code: "ko", isBase: false },
    { projectId: "q", surfaceId: "s3", surfaceSlug: "web", code: "ja", isBase: false },
  ];
  const cells = [
    { projectId: "p", surfaceId: "s1", localeCode: "ko", needsReview: true, count: 3 },
    { projectId: "p", surfaceId: "s1", localeCode: "ko", needsReview: false, count: 9 },
    { projectId: "p", surfaceId: "s2", localeCode: "ko", needsReview: true, count: 2 },
    // 살아 있지 않은 로케일의 셀은 세지 않는다 — 분모(키)는 orphaned를 빼므로 분자가 분모를 넘는다.
    { projectId: "p", surfaceId: "s1", localeCode: "gone", needsReview: true, count: 7 },
    { projectId: "q", surfaceId: "s3", localeCode: "ja", needsReview: false, count: 4 },
  ];

  it("프로젝트별로 (표면, 로케일) 검토 수를 내고 검토가 없는 칸은 뺀다", () => {
    const got = rowReviewCells(locales, cells);
    expect(got.get("p")).toEqual([{ surfaceId: "s1", code: "ko", count: 3 }, { surfaceId: "s2", code: "ko", count: 2 }]);
    expect(got.has("q")).toBe(false);
  });
});

/**
 * **계정 합계 넷** (DESIGN §6.63의 Summary 항). 검색 전 전체 멤버십 중 **보관하지 않은** 프로젝트의 값이다.
 */
/**
 * Home 카드의 보조 줄 `8 cells · 5 en, 3 ja` (DESIGN §6.64). 프로젝트 합은
 * 그 분해가 없었다 — **같은 `foldCells`를 쓰므로 "살아 있는 로케일만"이 한 벌로 남는다.**
 */
describe("reviewByLocale — 검토 대기의 로케일별 분해", () => {
  const locales = [
    { projectId: "p", surfaceId: "web", surfaceSlug: "web", code: "en", isBase: true },
    { projectId: "p", surfaceId: "web", surfaceSlug: "web", code: "ja", isBase: false },
    { projectId: "p", surfaceId: "emails", surfaceSlug: "emails", code: "ja", isBase: false },
  ];
  const cells = [
    { projectId: "p", surfaceId: "web", localeCode: "en", needsReview: true, count: 5 },
    { projectId: "p", surfaceId: "web", localeCode: "ja", needsReview: true, count: 2 },
    { projectId: "p", surfaceId: "emails", localeCode: "ja", needsReview: true, count: 1 },
    { projectId: "p", surfaceId: "web", localeCode: "ja", needsReview: false, count: 9 },
  ];

  it("표면을 가로질러 로케일 코드로 합친다 — 카드의 수와 같은 모집단이다", () => {
    expect(reviewByLocale(locales, cells).get("p")).toEqual([{ code: "en", count: 5 }, { code: "ja", count: 3 }]);
  });

  /** 많은 쪽이 먼저다 — 보조 줄이 앞부터 잘리므로 큰 수가 화면에 남아야 한다. */
  it("건수 내림차순, 동점은 코드 유닛 비교다", () => {
    const tied = [
      { projectId: "p", surfaceId: "web", localeCode: "ja", needsReview: true, count: 2 },
      { projectId: "p", surfaceId: "web", localeCode: "en", needsReview: true, count: 2 },
    ];
    expect(reviewByLocale(locales, tied).get("p")).toEqual([{ code: "en", count: 2 }, { code: "ja", count: 2 }]);
  });

  /** ⚠️ orphaned 로케일의 셀은 ①에 없으므로 버려진다 — `rowReviewCells`와 **같은 접기**다. */
  it("살아 있지 않은 로케일의 셀은 세지 않는다", () => {
    const stray = [{ projectId: "p", surfaceId: "web", localeCode: "fr", needsReview: true, count: 4 }];
    expect(reviewByLocale(locales, stray).get("p")).toBeUndefined();
  });

  it("검토 대기가 없으면 항목이 없다", () => {
    expect(reviewByLocale(locales, [{ projectId: "p", surfaceId: "web", localeCode: "en", needsReview: false, count: 5 }]).get("p")).toBeUndefined();
  });
});

describe("summaryQueue", () => {
  const base = {
    projects: [{ projectId: "p", archived: false }],
    locales: [
      { projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "en", isBase: true },
      { projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "ko", isBase: false },
    ],
    keyTotals: new Map([["p", 10]]),
    cells: [
      { projectId: "p", surfaceId: "p", localeCode: "en", needsReview: false, count: 10 },
      { projectId: "p", surfaceId: "p", localeCode: "ko", needsReview: false, count: 4 },
      { projectId: "p", surfaceId: "p", localeCode: "ko", needsReview: true, count: 3 },
    ],
    newKeys: new Map([["p", 2]]),
    unsent: new Map([["p", 5]]),
  };

  it("네 값을 낸다 — 미번역은 살아 있는 키 × 살아 있는 로케일 − 값이 있는 셀이다", () => {
    // 10키 × 2로케일 = 20칸, 값이 있는 것은 10 + 4 + 3 = 17 → 3칸이 남는다.
    expect(summaryQueue(base)).toEqual({ newFromGithub: 2, toTranslate: 3, toReview: 3, toSend: 5 });
  });

  /**
   * ⚠️ **Meter의 셋 제한을 집계에 적용하지 않는다** — 59로케일 리포에서 넷째 로케일부터의 미번역이
   * 통째로 사라진다 (`i18n-many-locales`가 그 실물이다).
   */
  it("로케일이 59개여도 전부 센다", () => {
    const codes = Array.from({ length: 59 }, (_, i) => `l${String(i).padStart(2, "0")}`);
    const got = summaryQueue({
      ...base,
      locales: codes.map((code, i) => ({ projectId: "p", surfaceId: "p", surfaceSlug: "default", code, isBase: i === 0 })),
      cells: [],
      newKeys: new Map(),
      unsent: new Map(),
    });
    expect(got.toTranslate).toBe(10 * 59);
  });

  /** 보관은 네 값 모두에서 빠진다 — 행과 Meter는 목록에 남는다(2026-09-13 사용자). */
  it("보관 프로젝트는 네 값 모두에서 빠진다", () => {
    const got = summaryQueue({
      ...base,
      projects: [{ projectId: "p", archived: true }],
    });
    expect(got).toEqual({ newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 0 });
  });

  it("보관과 활성이 섞이면 활성 것만 센다", () => {
    const got = summaryQueue({
      ...base,
      projects: [{ projectId: "p", archived: false }, { projectId: "q", archived: true }],
      locales: [...base.locales, { projectId: "q", surfaceId: "q", surfaceSlug: "default", code: "en", isBase: true }],
      keyTotals: new Map([["p", 10], ["q", 100]]),
      newKeys: new Map([["p", 2], ["q", 50]]),
      unsent: new Map([["p", 5], ["q", 70]]),
    });
    expect(got).toEqual({ newFromGithub: 2, toTranslate: 3, toReview: 3, toSend: 5 });
  });

  it("orphaned 로케일의 셀은 미번역·검토 어느 쪽에도 안 들어간다", () => {
    const got = summaryQueue({
      ...base,
      cells: [...base.cells, { projectId: "p", surfaceId: "p", localeCode: "fr", needsReview: true, count: 9 }],
    });
    expect(got.toReview).toBe(3);
    expect(got.toTranslate).toBe(3);
  });

  it.each([
    ["키 0", { keyTotals: new Map() }],
    ["로케일 0", { locales: [] }],
  ])("%s이면 미번역도 0이다 — 음수를 내지 않는다", (_label, over) => {
    expect(summaryQueue({ ...base, ...over, cells: [] }).toTranslate).toBe(0);
  });

  it("집계에 없는 프로젝트의 수치는 0이다", () => {
    const got = summaryQueue({ ...base, newKeys: new Map(), unsent: new Map() });
    expect(got).toMatchObject({ newFromGithub: 0, toSend: 0 });
  });
});

/** 서버가 싣는 판정(`row.plan`)을 붙인다 — 그룹은 그것을 읽기만 한다. */
const withPlan = <T extends RowInput>(input: T): T & { plan: ProjectRowPlan } => ({ ...input, plan: planProjectRow(input, []) });

describe("groupProjects — 검색 중에는 평평하다 (DESIGN §6.63)", () => {
  const rows = [
    { slug: "b", ...READY, ...QUIET, archivedAt: new Date("2026-09-01T00:00:00Z") },
    { slug: "a", ...READY, ...QUIET },
    { slug: "c", ...READY, ...QUIET, repositoryId: null },
  ].map(withPlan);

  it("질의가 없으면 그룹 순서가 고정이다 — 손볼 것이 먼저다", () => {
    const got = groupProjects(rows, undefined);
    expect(got.flat).toBe(false);
    if (got.flat) return;
    expect(got.groups.map(([group, list]) => [group, list.map((r) => r.slug)])).toEqual([
      ["needs_attention", ["c"]],
      ["all_set", ["a"]],
      ["archived", ["b"]],
    ]);
  });

  it("빈 그룹은 헤더를 만들지 않는다", () => {
    const got = groupProjects([rows[1]!], "");
    expect(got.flat).toBe(false);
    if (got.flat) return;
    expect(got.groups.map(([group]) => group)).toEqual(["all_set"]);
  });

  it.each(["chrome", "  chrome  "])("질의 %o가 있으면 평평한 목록 하나다", (q) => {
    const got = groupProjects(rows, q);
    expect(got.flat).toBe(true);
    if (!got.flat) return;
    expect(got.rows.map((r) => r.slug)).toEqual(["b", "a", "c"]);
  });

  it("공백만인 질의는 질의가 없는 것과 같다", () => {
    expect(groupProjects(rows, "   ").flat).toBe(false);
  });

  it("입력 배열을 건드리지 않는다 — 호출부가 같은 배열로 총계도 센다", () => {
    const original = [...rows];
    groupProjects(rows, undefined);
    expect(rows).toEqual(original);
  });
});

/**
 * **본문이 네 모양 중 어느 것인가** — 아트보드 `1a`~`1d`와 1:1 (DESIGN §6.63).
 *
 * ⚠️ **지금은 `hasProjects`·`query`·`rows.length` 셋이 JSX 안에서 섞여 판정된다.** 넷을 한 자리에
 * 모아야 갈래를 그대로 단언할 수 있다.
 */
describe("listBody — 아트보드 넷과 1:1", () => {
  const all = [
    { slug: "b", name: "old-landing", ...READY, ...QUIET, archivedAt: new Date("2026-09-01T00:00:00Z") },
    { slug: "a", name: "admin-console", ...READY, ...QUIET },
    { slug: "c", name: "chrome-extension", ...READY, ...QUIET, repositoryId: null },
  ].map(withPlan);

  it("`1a` — 질의가 없으면 그룹 카드가 순서대로 선다", () => {
    const body = listBody(all, undefined);
    expect(body.kind).toBe("groups");
    if (body.kind !== "groups") return;
    expect(body.cards.map((card) => [card.group, card.rows.map((r) => r.slug)])).toEqual([
      ["needs_attention", ["c"]],
      ["all_set", ["a"]],
      ["archived", ["b"]],
    ]);
  });

  it("`1b` — 프로젝트가 하나도 없으면 빈 상태다", () => {
    expect(listBody([], undefined)).toEqual({ kind: "empty" });
  });

  /**
   * ⚠️ **결과를 그룹으로 쪼개지 않는다** — 1건에 헤더 셋이면 둘이 빈 카드가 된다. 상태는 행의 칩이
   * 계속 말한다.
   */
  it("`1c` — 질의가 맞으면 결과 하나이고 그룹이 아니다", () => {
    const body = listBody(all, "chrome");
    expect(body.kind).toBe("results");
    if (body.kind !== "results") return;
    expect(body.query).toBe("chrome");
    expect(body.rows.map((r) => r.slug)).toEqual(["c"]);
  });

  it("`1d` — 질의가 0건이면 되돌리는 갈래다", () => {
    expect(listBody(all, "stripe")).toEqual({ kind: "no-results", query: "stripe" });
  });

  /** ⚠️ **앞뒤 공백을 떼고 화면에 싣는다** — 제목이 `Results for “ chrome ”`이 되면 안 된다. */
  it("질의의 앞뒤 공백을 떼고 낸다", () => {
    const body = listBody(all, "  chrome  ");
    expect(body.kind).toBe("results");
    if (body.kind !== "results") return;
    expect(body.query).toBe("chrome");
  });

  it.each(["", "   ", undefined])("질의 %o는 질의가 없는 것과 같다 — 그룹이다", (q) => {
    expect(listBody(all, q).kind).toBe("groups");
  });

  /**
   * ⚠️ **보관만 있어도 `empty`가 아니다** (PRODUCT §7.9). 보관은 삭제가 아니라 세 번째 그룹이고,
   * 빈 화면으로 바뀌면 사용자가 프로젝트를 잃었다고 읽는다.
   */
  it("보관만 남아도 그룹 카드다 — 빈 화면이 아니다", () => {
    const body = listBody([all[0]!], undefined);
    expect(body.kind).toBe("groups");
    if (body.kind !== "groups") return;
    expect(body.cards.map((card) => card.group)).toEqual(["archived"]);
  });

  /**
   * ⚠️ **프로젝트가 0건이면 질의가 있어도 `empty`다.** 머리가 검색을 그리지 않으므로 질의는 주소창으로만
   * 오는데, 그 사람에게 줄 출구는 "검색을 되돌려라"가 아니라 **"만들어라"**다.
   */
  it("프로젝트가 0건이면 질의가 있어도 빈 상태다", () => {
    expect(listBody([], "chrome")).toEqual({ kind: "empty" });
  });

  it("입력 배열을 건드리지 않는다 — 호출부가 같은 배열로 총계도 센다", () => {
    const original = [...all];
    listBody(all, "chrome");
    expect(all).toEqual(original);
  });
});

describe("planProjectRow — 건강과 할 일", () => {
  const at = new Date("2026-10-01T00:00:00Z");
  const blank = { kind: "never_filled" as const, at, surfaceSlug: "web", code: "ko", name: "Korean", keys: 5, ownerRetries: false };
  const todos = (input: ReturnType<typeof row>, neverFilled = false) => projectTodos({
    status: projectStatus(input), role: "OWNER", createdAt: at,
    connectionPinned: input.repositoryId !== null && (input.repoHost === "gitlab" ? input.gitlabConnectionId !== null : input.installationId !== null),
    gitlabTokenExpiresAt: input.gitlabTokenExpiresAt,
    attention: [
      ...input.surfaces.flatMap(s => s.importError !== null && !s.importing ? [{ kind: "import_failed" as const, at, surfaceSlug: "web", reason: s.importError }] : []),
      ...(input.review > 0 ? [{ kind: "review" as const, at, surfaceSlug: "web", code: "ko", name: "Korean", count: input.review, who: null }] : []),
      ...(neverFilled ? [blank] : []),
    ],
    unsent: input.unsent > 0 ? { count: input.unsent, surfaceSlug: "web", at } : null,
  });

  it.each([
    ["보관", { archivedAt: at }, "archived", "archived", null],
    ["연결 끊김", { repositoryId: null }, "disconnected", "needs_attention", "needs_reconnect"],
    ["실패", failed("parse-failed"), "syncFailed", "needs_attention", "import_failed"],
    ["일부 반영", failed("partial-import"), "partiallySynced", "needs_attention", "import_failed"],
    ["연결 전", { installationId: null }, "setup", "needs_attention", "setup"],
    ["첫 적재 중", { surfaces: [{ ...FIRST, importing: true }] }, "syncing", "needs_attention", null],
    ["첫 적재 대기", { surfaces: [FIRST] }, "notSyncedYet", "needs_attention", null],
    ["정상", {}, "active", "all_set", null],
  ] as const)("상태표: %s", (_label, over, chip, group, banner) => {
    const input = row(over);
    const plan = planProjectRow(input, todos(input));
    expect(plan).toMatchObject({ chip, group });
    expect(plan.banner?.kind ?? null).toBe(banner);
  });

  it("미발송이 PR 조회 실패보다 먼저다", () => {
    const input = row({ unsent: 3, openPr: undefined });
    expect(planProjectRow(input, todos(input))).toEqual({ chip: "active", group: "all_set", banner: { kind: "unsent", count: 3 } });
  });

  it.each(["github", "gitlab"])("%s EDITOR의 연결·설정과 빈 언어도 같은 판정이다", repoHost => {
    const input = row({ repoHost, gitlabConnectionId: "connection" });
    const todo = projectTodos({ status: "active", role: "EDITOR", createdAt: at, connectionPinned: true,
      gitlabTokenExpiresAt: null, attention: [blank], unsent: null });
    // 띠는 그리는 데 쓰는 필드만 싣는다 — 할 일의 시각·역할 플래그는 Inbox 몫이다.
    expect(planProjectRow(input, todo)).toEqual({ chip: "active", group: "all_set",
      banner: { kind: "never_filled", surfaceSlug: "web", code: "ko", name: "Korean", keys: 5 } });
    const setup = row({ repoHost, installationId: null, repositoryId: null, gitlabConnectionId: null, surfaces: [] });
    expect(planProjectRow(setup, [])).toMatchObject({ chip: "setup", banner: { kind: "setup" } });
  });

  /**
   * 옛 판정 넷(`projectGroup`·`rowBanner`·`rowChip`·`meterSlot`)이 따로 고정하던 갈래 — 한 표로 접힌 뒤에도 같은 답이어야 하는 것만 옮겼다.
   * 그룹이 바뀐 갈래(미발송·리포 앞섬 → All set)는 위 표와 아래 전수가 센다.
   */
  it.each([
    ["적재가 도는 중이면 옛 실패를 외치지 않는다", failed("parse-failed", true), "active", null],
    ["A 동기화 중 + B 실패 → B의 실패", { surfaces: [{ ...S, importing: true }, { ...S, importError: "parse-failed" as const }] }, "syncFailed", "import_failed"],
    ["A partial + B failed → failed", { surfaces: [{ ...S, importError: "partial-import" as const }, { ...S, importError: "import-failed" as const }] }, "syncFailed", "import_failed"],
    ["첫 적재 실패", { surfaces: [{ ...FIRST, importError: "parse-failed" as const }] }, "syncFailed", "import_failed"],
    ["첫 적재 대기에서 진행이 실패를 이긴다", { surfaces: [{ ...FIRST, importError: "parse-failed" as const, importing: true }] }, "syncing", null],
    ["setup + 실패 → 실패", { installationId: null, ...failed("parse-failed") }, "syncFailed", "import_failed"],
    ["끊김 + 실패 → 끊김", { repositoryId: null, ...failed("import-failed"), unsent: 3 }, "disconnected", "needs_reconnect"],
    ["끊김 + PR 조회 실패 → 끊김", { repositoryId: null, openPr: undefined }, "disconnected", "needs_reconnect"],
    ["보관 + 끊김 + 실패 → 보관", { archivedAt: new Date(0), repositoryId: null, ...failed("parse-failed") }, "archived", null],
    ["리포 앞섬이 검토를 이긴다", { repoAheadFiles: 3, review: 88 }, "active", "repo_ahead"],
    ["PR 조회 실패가 리포 앞섬·검토를 이긴다", { openPr: undefined, repoAheadFiles: 2, review: 5 }, "active", "pr_check_failed"],
    ["원격 신호가 없으면 DB 할 일은 남는다", { openPr: null, repoAheadFiles: 0, review: 88 }, "active", "review"],
  ] as const)("%s", (_label, over, chip, banner) => {
    const input = row(over);
    const plan = planProjectRow(input, todos(input));
    expect(plan.chip).toBe(chip);
    expect(plan.banner?.kind ?? null).toBe(banner);
  });

  it("partial 실패의 띠 사유는 partial이고 danger 실패의 칩은 Sync failed다", () => {
    const partial = row(failed("partial-import"));
    expect(planProjectRow(partial, todos(partial)).banner).toEqual({ kind: "import_failed", reason: "partial-import" });
    const danger = row(failed("import-failed"));
    expect(planProjectRow(danger, todos(danger))).toMatchObject({ chip: "syncFailed", banner: { reason: "import-failed" } });
  });

  it("입력에 역할이 없다 — 링크의 역할 분기는 호출부가 한다", () => {
    expect(Object.keys(row())).not.toContain("role");
  });

  it("입력 축 2,880조합에서 불변식 넷과 띠 우선순위를 센다", () => {
    let cases = 0;
    const seen = new Map<string, number>();
    for (const archived of [false, true])
    for (const status of ["active", "setup", "awaiting_first_sync", "needs_reconnect", "archived"] as const)
    for (const failure of [null, "parse-failed", "partial-import"] as const)
    for (const importing of [false, true])
    for (const openPr of [null, undefined, { number: 1, url: "https://example.com/1" }])
    for (const unsent of [0, 2])
    for (const repoAheadFiles of [0, 2])
    for (const review of [0, 2])
    for (const neverFilled of [false, true]) {
      const input = row({ archivedAt: archived || status === "archived" ? at : null,
        installationId: status === "setup" ? null : "i", repositoryId: status === "needs_reconnect" ? null : "r",
        surfaces: [{ ...S, lastCommitSha: status === "awaiting_first_sync" ? null : "s", importError: failure, importing }],
        openPr, unsent, repoAheadFiles, review });
      // 축이 의도한 상태에 실제로 닿는다 — 기본값이 바뀌어 상태가 접히면 아래 불변식이 공허하게 green이 된다(RA 🟢1).
      expect(projectStatus(input)).toBe(archived ? "archived" : status);
      const plan = planProjectRow(input, todos(input, neverFilled));
      const kind = plan.banner?.kind;
      seen.set(kind ?? "none", (seen.get(kind ?? "none") ?? 0) + 1);
      if (kind && ["needs_reconnect", "import_failed", "setup"].includes(kind)) expect(plan.group).toBe("needs_attention");
      if (kind && ["unsent", "pr_open", "pr_check_failed", "repo_ahead", "review", "never_filled"].includes(kind)) expect([plan.chip, plan.group]).toEqual(["active", "all_set"]);
      expect(plan.chip === "active").toBe(plan.group === "all_set");
      if (input.archivedAt !== null) expect(plan.banner).toBeNull();
      if (plan.chip === "active") expect(kind ?? null).toBe(unsent ? "unsent" : openPr === undefined ? "pr_check_failed" : openPr ? "pr_open" : repoAheadFiles ? "repo_ahead" : review ? "review" : neverFilled ? "never_filled" : null);
      cases++;
    }
    expect(cases).toBe(2880);
    // 띠 종류 열(없음 포함)이 전부 나오고 각각 여러 조합에서 나온다 — 한 갈래만 도는 표는 불변식을 재지 못한다.
    for (const kind of ["none", "needs_reconnect", "import_failed", "setup", "unsent", "pr_open", "pr_check_failed", "repo_ahead", "review", "never_filled"]) {
      expect(seen.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(2);
    }
  });
});
