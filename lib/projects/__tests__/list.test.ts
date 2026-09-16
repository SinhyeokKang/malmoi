import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import {
  groupProjects,
  highlightName,
  listBody,
  meterSlot,
  projectGroup,
  projectStatus,
  rowBanner,
  reviewByLocale,
  rowLocaleProgress,
  searchProjects,
  summaryQueue,
  type ProjectStatus,
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

describe("projectStatus", () => {
  const READY = { archivedAt: null, installationId: "1", surfaces: [{ archivedAt: null, lastCommitSha: "a".repeat(40) }], repositoryId: "42" };

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
      projectStatus({ archivedAt: new Date(), installationId: null, surfaces: [{ archivedAt: null, lastCommitSha: null }], repositoryId: null }),
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

  it("갈래 다섯이 전부 문구를 갖는다", () => {
    for (const status of ALL) expect(m.projects.status[status]).toBeTruthy();
  });

  it("내부 이름을 흘리지 않는다 — 읽는 사람은 비개발자 동료다", () => {
    for (const status of ALL) {
      const label = m.projects.status[status];
      expect(label).not.toContain(status);
      // snake_case는 우리 내부 이름의 모양이다 — en 라벨의 보통 낱말과 갈린다.
      expect(label).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it("다섯이 서로 다르다 — 한 문구로 접히면 상태를 구별할 수 없다", () => {
    expect(new Set(ALL.map((s) => m.projects.status[s])).size).toBe(ALL.length);
  });
});

/**
 * **목록 재설계의 판정 여섯** (projects-list design §4·§5). 전부 I/O가 없는 잎이고, 그래서
 * `components/__tests__/client-graph.test.ts`가 이 모듈을 클라이언트 번들 밖에 둔다.
 *
 * ⚠️ **상태표(design §5)가 정본이다.** 캔버스 `1c`에서 그대로 옮긴 표이고, 아래 매트릭스는 그 행과
 * 1:1이다 — 표에 없는 조합을 여기서 발명하지 않는다.
 */

const READY = { installationId: "i", surfaces: [{ archivedAt: null, lastCommitSha: "s" }], repositoryId: "r", archivedAt: null } as const;
const QUIET = { review: 0, unsent: 0, openPr: null, repoAheadFiles: 0, importError: null, importing: false } as const;
const row = (over: Partial<Parameters<typeof rowBanner>[0]> = {}) => ({ ...READY, ...QUIET, ...over });

describe("projectGroup — 상태표의 그룹 열과 1:1 (design §5)", () => {
  it.each([
    ["active · all set", {}],
    ["review pending", { review: 88 }],
    ["pull request open", { openPr: { number: 142, url: "https://github.com/o/r/pull/142" } }],
  ])("%s은 All set이다 — 손댈 것이 없거나 읽기만 하면 된다", (_label, over) => {
    expect(projectGroup(row(over))).toBe("all_set");
  });

  it.each([
    ["unsent edits", { unsent: 24 }],
    ["repo moved ahead", { repoAheadFiles: 3 }],
    ["awaiting first sync", { surfaces: [{ archivedAt: null, lastCommitSha: null }] }],
    ["setup", { installationId: null }],
    ["needs reconnect", { repositoryId: null }],
    ["import failed", { importError: "parse-failed" as const }],
  ])("%s은 Needs attention이다", (_label, over) => {
    expect(projectGroup(row(over))).toBe("needs_attention");
  });

  /** 보관은 사건과 무관하다 — 멈춘 프로젝트에 "지금 뭘 하면 되나"는 답할 질문이 아니다. */
  it("보관은 어떤 사건이 겹쳐도 Archived다", () => {
    const archived = { archivedAt: new Date("2026-09-01T00:00:00Z") };
    expect(projectGroup(row({ ...archived, unsent: 24, review: 9, repoAheadFiles: 3 }))).toBe("archived");
  });
});

describe("rowBanner — 겹치면 하나만 (design §4 우선순위)", () => {
  it("보관 행에는 액션이 없다", () => {
    expect(rowBanner(row({ archivedAt: new Date(), unsent: 24, review: 9 }))).toBeNull();
  });

  /** 끊긴 연결은 모든 것을 덮는다 — 그 밑의 사건은 전부 손댈 수 없는 상태다. */
  it("needs_reconnect가 사건 전부를 덮는다", () => {
    expect(rowBanner(row({ repositoryId: null, unsent: 24, review: 9, repoAheadFiles: 3 }))).toEqual({
      kind: "needs_reconnect",
    });
  });

  it("임포트 실패가 사건을 덮는다 — 적재된 프로젝트에서도 뜬다", () => {
    expect(rowBanner(row({ importError: "parse-failed", review: 9 }))).toEqual({
      kind: "import_failed",
      reason: "parse-failed",
    });
  });

  /**
   * ⚠️ **지금 돌고 있으면 지난 실패를 외치지 않는다.** `lastImportStartedAt`이 서 있다는 것은 새
   * 실행이 시작됐다는 뜻이고, 남아 있는 코드는 **이전 실행의 것**이다 — 끝나면 성공이 비우거나
   * 실패가 덮어쓴다.
   */
  it("적재가 도는 중에는 옛 실패 띠를 그리지 않는다", () => {
    expect(rowBanner(row({ importError: "parse-failed", importing: true }))).toBeNull();
  });

  it("setup은 자기 띠를 갖고, 첫 적재 대기는 안 갖는다 — 그 문장은 Meter 자리가 든다", () => {
    expect(rowBanner(row({ installationId: null }))).toEqual({ kind: "setup" });
    expect(rowBanner(row({ surfaces: [{ archivedAt: null, lastCommitSha: null }] }))).toBeNull();
  });

  /** E: 머지만 남은 프로젝트도 편집이 남아 있으면 그 사실을 먼저 본다. */
  it("안 보낸 편집이 열린 PR을 이긴다", () => {
    const pr = { number: 142, url: "https://github.com/o/r/pull/142" };
    expect(rowBanner(row({ unsent: 24, openPr: pr }))).toEqual({ kind: "unsent", count: 24 });
    expect(rowBanner(row({ openPr: pr }))).toEqual({ kind: "pr_open", number: 142, url: pr.url });
  });

  it("원격 변경이 검토를 이긴다 — C′는 키가 아니라 파일 수다", () => {
    expect(rowBanner(row({ repoAheadFiles: 3, review: 88 }))).toEqual({ kind: "repo_ahead", files: 3 });
    expect(rowBanner(row({ review: 88 }))).toEqual({ kind: "review", count: 88 });
  });

  it("사건이 없으면 띠도 없다", () => {
    expect(rowBanner(row())).toBeNull();
  });

  /** GitHub 조회가 실패하면 그 둘만 빠진다 — 0과 null이 "그 신호 없음"이다. */
  it("원격 신호가 없으면 그 띠만 사라지고 DB 사건은 남는다", () => {
    expect(rowBanner(row({ openPr: null, repoAheadFiles: 0, review: 88 }))).toEqual({ kind: "review", count: 88 });
  });

  /**
   * ⚠️ **역할을 받지 않는다** (F). 링크가 역할로 갈리는 셋(`Reconnect`·`Continue setup`·
   * `View details`)의 판정은 **호출부**가 `row.role`로 한다 — 띠를 순수하게 유지하는 것이
   * 이 매트릭스를 반으로 줄인다.
   */
  it("입력에 역할이 없다", () => {
    expect(Object.keys(row())).not.toContain("role");
  });
});

describe("meterSlot — 0% 바를 금지하는 것이 계약이다 (design §5)", () => {
  it("값이 있는 상태는 바를 그린다", () => {
    const locales = [{ surfaceSlug: "default", code: "ko", isBase: false, total: 10, done: 5, review: 1, percent: 50 }];
    expect(meterSlot(row(), locales)).toEqual({ kind: "meters", locales });
  });

  it.each([
    ["setup", { installationId: null }, "setup"],
    ["첫 적재 대기", { surfaces: [{ archivedAt: null, lastCommitSha: null }] }, "waiting"],
    ["적재 진행 중", { surfaces: [{ archivedAt: null, lastCommitSha: null }], importing: true }, "importing"],
    ["첫 적재 실패", { surfaces: [{ archivedAt: null, lastCommitSha: null }], importError: "parse-failed" as const }, "failed"],
  ])("%s은 바가 아니라 문장이다", (_label, over, note) => {
    expect(meterSlot(row(over), [])).toEqual({ kind: "note", note });
  });

  /**
   * ⚠️ **이미 적재된 프로젝트의 실패는 Meter를 지우지 않는다** (design §5) — 데이터가 있는데
   * 문장으로 덮으면 "번역이 사라졌다"로 읽힌다. 그 사실은 띠가 말한다.
   */
  it("적재된 뒤의 실패는 바를 유지한다", () => {
    const locales = [{ surfaceSlug: "default", code: "ko", isBase: false, total: 10, done: 5, review: 1, percent: 50 }];
    expect(meterSlot(row({ importError: "partial-import" }), locales)).toEqual({ kind: "meters", locales });
  });

  /** 진행 중이 더 최신 사실이다 — 남아 있는 코드는 이전 실행의 것이다. */
  it("첫 적재 대기에서 진행이 실패를 이긴다", () => {
    expect(meterSlot(row({ surfaces: [{ archivedAt: null, lastCommitSha: null }], importError: "parse-failed", importing: true }), [])).toEqual({
      kind: "note",
      note: "importing",
    });
  });
});

/**
 * **행의 Meter 재료** (design §3.1). ①②③의 조회 결과를 프로젝트별로 접는다.
 *
 * ⚠️ **`localeProgress`(`lib/keys/view.ts`)와 합치지 않는다** — 저쪽은 `untranslated`·orphaned 꼬리까지
 * 드는 화면 계약이고 여기 필요한 것은 두 구간 비율뿐이다. **`percent`의 내림 규칙만 그대로 쓴다**
 * (902/903이 100%로 보이면 안 된다).
 */
describe("rowLocaleProgress", () => {
  const locales = [
    { projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "ko", isBase: false },
    { projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "en", isBase: true },
    { projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "ja", isBase: false },
    { projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "de", isBase: false },
  ];
  const totals = new Map([["p", 10]]);

  it("base가 먼저, 나머지는 코드순, 그리고 셋까지다", () => {
    const got = rowLocaleProgress(locales, totals, []);
    expect(got.get("p")?.map((l) => l.code)).toEqual(["en", "de", "ja"]);
  });

  /**
   * ⚠️ **두 구간은 겹치지 않고, 라벨은 그 둘의 합이다** (캔버스 `1c`: `done 84 + review 8 → 92%`).
   * 바의 폭이 겹치면 트랙을 넘어 흐르고, 라벨을 `done`만으로 내면 검토를 기다리는 값이 화면에서
   * 미번역과 구별되지 않는다.
   */
  it("두 구간이 겹치지 않고 라벨이 그 합이다", () => {
    const cells = [
      { projectId: "p", surfaceId: "p", localeCode: "en", needsReview: false, count: 7 },
      { projectId: "p", surfaceId: "p", localeCode: "en", needsReview: true, count: 2 },
    ];
    const en = rowLocaleProgress(locales, totals, cells).get("p")?.[0];
    expect(en).toMatchObject({ surfaceSlug: "default", code: "en", total: 10, done: 7, review: 2, percent: 90 });
  });

  it("내림이다 — 902/903이 100%로 보이면 안 된다", () => {
    const got = rowLocaleProgress(
      [{ projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "en", isBase: true }],
      new Map([["p", 903]]),
      [{ projectId: "p", surfaceId: "p", localeCode: "en", needsReview: false, count: 902 }],
    );
    expect(got.get("p")?.[0]?.percent).toBe(99);
  });

  /** 캔버스의 값 그대로 — 84 + 8이 92로 읽힌다. */
  it("캔버스 `1c`의 en 행을 재현한다", () => {
    const got = rowLocaleProgress(
      [{ projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "en", isBase: true }],
      new Map([["p", 100]]),
      [
        { projectId: "p", surfaceId: "p", localeCode: "en", needsReview: false, count: 84 },
        { projectId: "p", surfaceId: "p", localeCode: "en", needsReview: true, count: 8 },
      ],
    );
    expect(got.get("p")?.[0]).toMatchObject({ done: 84, review: 8, percent: 92 });
  });

  it("분모가 0이면 비율도 0이다 — 0으로 나누지 않는다", () => {
    const got = rowLocaleProgress([{ projectId: "p", surfaceId: "p", surfaceSlug: "default", code: "en", isBase: true }], new Map(), []);
    expect(got.get("p")?.[0]).toMatchObject({ total: 0, done: 0, review: 0, percent: 0 });
  });

  /** ③은 orphaned 로케일의 번역을 포함할 수 있다 — ①에 없는 셀은 먼저 버린다. */
  it("살아 있는 로케일 목록에 없는 셀은 버린다", () => {
    const cells = [{ projectId: "p", surfaceId: "p", localeCode: "fr", needsReview: false, count: 5 }];
    const got = rowLocaleProgress(locales, totals, cells);
    expect(got.get("p")?.map((l) => l.code)).toEqual(["en", "de", "ja"]);
    expect(got.get("p")?.every((l) => l.done === 0)).toBe(true);
  });

  it("다른 프로젝트의 값이 섞이지 않는다", () => {
    const got = rowLocaleProgress(
      [...locales, { projectId: "q", surfaceId: "q", surfaceSlug: "default", code: "en", isBase: true }],
      new Map([["p", 10], ["q", 4]]),
      [{ projectId: "q", surfaceId: "q", localeCode: "en", needsReview: false, count: 4 }],
    );
    expect(got.get("q")?.[0]).toMatchObject({ total: 4, done: 4, percent: 100 });
    expect(got.get("p")?.[0]?.done).toBe(0);
  });
});

/**
 * **계정 합계 넷** (design §3.2). 검색 전 전체 멤버십 중 **보관하지 않은** 프로젝트의 값이다.
 */
/**
 * Home 카드의 보조 줄 `8 cells · 5 en, 3 ja` (project-home design §3.2). `rowReviewCounts`는 프로젝트
 * 단위로 접어서 그 분해가 없었다 — **같은 `foldCells`를 쓰므로 "살아 있는 로케일만"이 한 벌로 남는다.**
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

  /** ⚠️ orphaned 로케일의 셀은 ①에 없으므로 버려진다 — `rowReviewCounts`와 **같은 접기**다. */
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

describe("groupProjects — 검색 중에는 평평하다 (design §4)", () => {
  const rows = [
    { slug: "b", ...READY, ...QUIET, archivedAt: new Date("2026-09-01T00:00:00Z") },
    { slug: "a", ...READY, ...QUIET },
    { slug: "c", ...READY, ...QUIET, unsent: 3 },
  ];

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
 * **검색 일치 구간은 이름에서만 칠한다** (캔버스 `3a`). `searchProjects`의 대상이 `row.name` 하나라
 * 리포 줄을 칠하면 화면이 실제보다 넓게 찾은 것처럼 말한다.
 */
describe("highlightName", () => {
  it("질의가 없으면 조각 하나다 — 칠할 것이 없다", () => {
    expect(highlightName("chrome-extension", "")).toEqual([{ text: "chrome-extension", match: false }]);
    expect(highlightName("chrome-extension", "   ")).toEqual([{ text: "chrome-extension", match: false }]);
  });

  it("일치 구간을 가른다", () => {
    expect(highlightName("chrome-extension", "chrome")).toEqual([
      { text: "chrome", match: true },
      { text: "-extension", match: false },
    ]);
  });

  /** `searchProjects`가 대소문자를 무시하므로 칠하는 쪽도 같아야 한다 — 아니면 찾았는데 안 칠해진다. */
  it("대소문자를 무시하되 원문 표기를 보존한다", () => {
    expect(highlightName("BugShot Web", "bugshot")).toEqual([
      { text: "BugShot", match: true },
      { text: " Web", match: false },
    ]);
  });

  it("여러 번 나오면 전부 칠한다", () => {
    expect(highlightName("a-b-a", "a")).toEqual([
      { text: "a", match: true },
      { text: "-b-", match: false },
      { text: "a", match: true },
    ]);
  });

  it("일치가 없으면 통째로 하나다", () => {
    expect(highlightName("chrome", "figma")).toEqual([{ text: "chrome", match: false }]);
  });

  /** ⚠️ **빈 조각을 내지 않는다** — 렌더가 빈 `<span>`을 만들면 padding이 붙어 글자 사이가 벌어진다. */
  it("앞뒤가 딱 맞아도 빈 조각이 없다", () => {
    expect(highlightName("chrome", "chrome")).toEqual([{ text: "chrome", match: true }]);
  });
});

it.each([
  ["İabc", "a", [{ text: "İ", match: false }, { text: "a", match: true }, { text: "bc", match: false }]],
  ["İabc", "i", [{ text: "İ", match: true }, { text: "abc", match: false }]],
  ["İİ", "i", [{ text: "İ", match: true }, { text: "İ", match: true }]],
])("소문자 변환이 길이를 늘려도 원래 이름의 일치 구간을 보존한다: %s / %s", (name, q, expected) => {
  expect(highlightName(name, q)).toEqual(expected);
});

/**
 * **본문이 네 모양 중 어느 것인가** — 아트보드 `1a`~`1d`와 1:1 (projects-panel-rework design §3.1).
 *
 * ⚠️ **지금은 `hasProjects`·`query`·`rows.length` 셋이 JSX 안에서 섞여 판정된다.** 넷을 한 자리에
 * 모아야 갈래를 그대로 단언할 수 있다.
 */
describe("listBody — 아트보드 넷과 1:1", () => {
  const all = [
    { slug: "b", name: "old-landing", ...READY, ...QUIET, archivedAt: new Date("2026-09-01T00:00:00Z") },
    { slug: "a", name: "admin-console", ...READY, ...QUIET },
    { slug: "c", name: "chrome-extension", ...READY, ...QUIET, unsent: 24 },
  ];

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
