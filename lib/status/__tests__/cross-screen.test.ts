import { describe, expect, it } from "vitest";

import { planConnectionHealth, type ProbeResult } from "@/lib/github-connect/health";
import { metaTabs } from "@/lib/home/meta";
import { connectionProblem, homeBannerState, planActionAvailability, planHomeState, repositoryConnectionState } from "@/lib/home/state";
import { en } from "@/messages/en";
import { planRepositoryImport, type ImportPlanInput } from "@/lib/import/plan";
import { planImportRefusal } from "@/lib/import/refusal";
import { planSurfaceImportStatus } from "@/lib/import/surface-status";
import { assembleProjectListRows, type ProjectListAggregates, type ProjectListMemberRow } from "@/lib/keys/query";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { importFailureTone } from "@/lib/projects/import-failure";
import { importOutcomeFields, isImportFailureCode, type ImportFailureCode } from "@/lib/projects/import-status";
import { CHIP_STATE, rowBanner, rowChip, worstFailingSurface, type RowBanner } from "@/lib/projects/list";
import { openPrGateApplies, planHoldNotice, type HoldReason } from "@/lib/protection/plan";

import { STATE, type StateKey } from "../canon";

/**
 * **화면 × 입력 교차 행렬** (ux-drift-unify spec 완료 조건 3 · design §3.8). 같은 프로젝트 상태를 목록·Home·Settings·Sources·적재 거부가
 * 같은 `STATE` 키로 말하는지 칸마다 센다 — 전에는 테스트가 한 화면 안의 결정만 고정해, 설치는 있고 `repositoryId`가 null인 프로젝트를
 * 세 화면이 세 상태로 말해도 전부 green이었다(🔴 C).
 *
 * ⚠️ **입력은 서버가 실제로 만드는 모양이다**(POSTMORTEM 2026-09-16 — 테스트가 상상한 조합이 폴백 경로를 가렸다). 표면 컬럼은
 * `importOutcomeFields`(`finishSurface`·`applyPushInTransaction`이 쓰는 그 함수)로 만들고, 목록 행은 `assembleProjectListRows`(조회의 조립 층)를,
 * Home의 표면은 Home 페이지와 같은 접기(`isImportFailureCode` · `lastImportStartedAt !== null`)를 지난다.
 *
 * ⚠️ **N/A 칸은 "그 판정이 이 입력을 받지 않는다"를 단언한다** — 빈 칸이 조용히 green이 되지 않게. 두 부류다:
 * - 입력 축이 판정의 매개변수에 없다 — 아래 `RECEIVES`가 **타입으로** 고정한다(판정이 그 축을 받기 시작하면 컴파일이 red다).
 * - readiness가 먼저 막는다 — Home(`ProjectNotReady`)·적재 거부(`not-ready`)가 그 판정에 닿지 않는다.
 *
 * ⚠️ **화면 쪽 매핑(판정 결과 → 상태 키)은 사본이 남은 것이 있다** — 목록 띠(`project-list.tsx` `ProjectBanner`)는 컴포넌트 안에 있다.
 * 칩(`CHIP_STATE`)·Home 배너 갈래(`homeBannerState`)·Settings 배지와 Home 메타 열 Connection 배지(둘 다 `repositoryConnectionState`, `lib/home/state.ts`)는
 * 화면이 쓰는 그 순수 매핑을 그대로 부른다(ux-drift-unify T18·T19·T22 · project-card-tabs fix1).
 */

// ── 판정 묶음 — 카나리아가 한 판정만 바꿔 넣는다 ─────────────────────────────

const REAL = {
  rowChip, rowBanner, worstFailingSurface,
  planConnectionHealth, connectionProblem, planHomeState, homeBannerState, planActionAvailability, planHoldNotice,
  planSurfaceImportStatus, planRepositoryImport, planProjectReadiness,
};
type Judgments = typeof REAL;

// ── 입력 — 서버가 만드는 모양 ─────────────────────────────────────────────

const T0 = new Date("2026-09-30T00:00:00Z");
const T1 = new Date("2026-09-30T01:00:00Z");

/** `TranslationSurface`에서 판정들이 읽는 컬럼. */
type SurfaceRow = {
  slug: string; archivedAt: null; lastCommitSha: string | null;
  lastImportStartedAt: Date | null; lastImportError: string | null; lastImportFailedAt: Date | null; lastImportedAt: Date | null;
};

/** 성공 적재가 한 번 끝난 표면 — `importOutcomeFields(null)` + SHA(`finishSurface`의 `empty`·`applyPushInTransaction`). */
const synced = (slug: string): SurfaceRow => ({ slug, archivedAt: null, lastCommitSha: "sha-1", lastImportedAt: null, ...importOutcomeFields(null, T0) });
/** 일부 반영 — `applyPushInTransaction`이 `importOutcome: "partial-import"`로 SHA와 실패 코드를 함께 쓴다. `lastImportedAt`은 앞 성공 값이 남는다. */
const partial = (slug: string): SurfaceRow => ({ ...synced(slug), lastCommitSha: "sha-2", ...importOutcomeFields("partial-import", T1) });
/** 실패 — `finishSurface`의 실패 갈래는 `importOutcomeFields("import-failed")`만 쓰고 SHA는 앞 값 그대로다. */
const failed = (slug: string): SurfaceRow => ({ ...synced(slug), ...importOutcomeFields("import-failed", T1) });
/** 동기화 중 — 적재 lease가 `lastImportStartedAt`을 세운다. 이전 결과 컬럼은 그대로다. */
const syncing = (slug: string): SurfaceRow => ({ ...synced(slug), lastImportStartedAt: T1 });

type Fixture = {
  installationId: string | null;
  repositoryId: string | null;
  archivedAt: Date | null;
  surfaces: SurfaceRow[];
  /** 게이트와 같은 술어로 센 미전달 편집 수(`countPending`) — 목록 `unsent`와 Home `toSend`가 같은 값이다. */
  pending: number;
  /** 열린 Malmoi PR 삼상태 — `undefined`는 확인 못 함(조회 실패·마감). */
  openPr: { number: number; url: string } | null | undefined;
  probe: ProbeResult;
};

const PR = { number: 7, url: "https://github.com/acme/web/pull/7" };
const PROBE_OK: ProbeResult = { status: "ok", installationId: "inst-1", repositoryId: "repo-1", fullName: "acme/web", defaultBranch: "main" };

const fixture = (over: Partial<Fixture> = {}): Fixture => ({
  installationId: "inst-1", repositoryId: "repo-1", archivedAt: null, surfaces: [synced("web")], pending: 0, openPr: null, probe: PROBE_OK, ...over,
});

// ── 화면 쪽 매핑의 사본 (위 머리 주석) ─────────────────────────────────────

const failureKey = (code: ImportFailureCode): StateKey => (importFailureTone(code) === "danger" ? "syncFailed" : "partiallySynced");

/** `project-list.tsx`의 띠 — 상태를 말하지 않는 띠(`repo_ahead`·`review`)는 이 행렬에 들지 않는다. */
function bannerKey(banner: RowBanner): StateKey | null {
  if (banner === null) return null;
  switch (banner.kind) {
    case "needs_reconnect": return "disconnected";
    case "import_failed": return failureKey(banner.reason);
    case "setup": return "setup";
    case "unsent": return "unsent";
    case "pr_open": return "prOpen";
    case "pr_check_failed": return "couldNotCheck";
    case "repo_ahead": case "review": return null;
  }
}


// ── 관측 — 입력 하나를 다섯 판정에 넣는다 ───────────────────────────────────

type NotApplicable = { na: string };
type Observed = {
  list: { chip: StateKey; banner: StateKey | null };
  home: { banner: StateKey | null; hold: HoldReason | null; actions: { publish: boolean; sync: boolean }; meta: StateKey } | NotApplicable;
  settings: StateKey | null;
  sources: StateKey[];
  refusal: { error: string; tone: string; message: string } | NotApplicable;
};

const EMPTY: ProjectListAggregates = { locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map(), unsentSurfaces: new Map(), newKeysBySurface: new Map(), unsentBySurface: new Map() };

function observe(f: Fixture, J: Judgments): Observed {
  const project = { installationId: f.installationId, repositoryId: f.repositoryId, repoOwner: "acme", repoName: "web", surfaces: f.surfaces };
  const archived = f.archivedAt !== null;

  // 목록 — 조회의 조립 층을 지난다(🔴 E의 결함은 판정이 아니라 조립에 있었다).
  const member: ProjectListMemberRow = {
    role: "OWNER",
    project: {
      id: "p1", slug: "acme", name: "Acme", image: null, installationId: f.installationId, archivedAt: f.archivedAt, repoOwner: "acme", repoName: "web",
      repositoryId: f.repositoryId, baseBranch: "main", lastPrUrl: f.openPr === null ? null : PR.url, _count: { members: 1 }, surfaces: f.surfaces,
    },
  };
  const [row] = assembleProjectListRows([member], { ...EMPTY, unsent: new Map([["p1", f.pending]]) }, new Map([["p1", { openPr: f.openPr, repoAheadFiles: 0 }]]));
  if (row === undefined) throw new Error("no row");
  // 칩은 화면이 `StatusBadge`에 넘기는 그 맵이다(ux-drift-unify T19 — 전엔 여기 사본이었다).
  const list = { chip: CHIP_STATE[J.rowChip(row)], banner: bannerKey(J.rowBanner(row)) };

  const health = J.planConnectionHealth({ project, probe: f.probe });
  const problem = J.connectionProblem(health.status);
  const readiness = J.planProjectReadiness(project);

  // Home — readiness가 `ready`가 아니면 `ProjectNotReady`가 대신 선다(`(home)/page.tsx`).
  let home: Observed["home"];
  if (readiness !== "ready") home = { na: `readiness:${readiness}` };
  else {
    const surfaces = f.surfaces.map((s) => ({ ...s, importError: isImportFailureCode(s.lastImportError) ? s.lastImportError : null, importing: s.lastImportStartedAt !== null }));
    const counts = { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: f.pending };
    const state = J.planHomeState({ archived, connection: health, surfaces, counts });
    const worst = J.worstFailingSurface(surfaces);
    // 배너 갈래는 `HomeNotices`가 부르는 그 함수다(ux-drift-unify T18 — 전엔 여기 사본이었다).
    const banner = J.homeBannerState({ state, problem, failure: worst === null ? null : worst.importError });
    const hold = J.planHoldNotice({
      pending: f.pending, openPr: f.openPr === undefined ? undefined : f.openPr?.url ?? null,
      gateApplies: openPrGateApplies(project), archived, disconnected: state === "not_connected",
    });
    // 메타 열 Connection 배지 — Settings와 같은 함수를 `metaTabs`에 넣고 그 행을 읽는다(project-card-tabs fix1 — 사본이 판정과 갈렸다).
    const meta = metaTabs({
      repository: { owner: "acme", name: "web", branch: "main", connection: repositoryConnectionState(health.status, problem) },
      ciConfigured: false, surfaceCount: f.surfaces.length, keys: 0, members: 1, pendingInvites: 0, createdAt: T0, archivedAt: f.archivedAt,
      lastSync: null, lastPublish: null, held: null, prState: "absent",
    }).project.flat().find((r) => r.kind === "connection");
    if (meta === undefined) throw new Error("no connection row");
    home = { banner, hold: hold?.reason ?? null, actions: J.planActionAvailability({ archived, connection: health.status }), meta: meta.state };
  }

  // Settings — 컴포넌트와 같은 함수다. `connectionProblem`을 넘겨받으므로 카나리아가 그 판정을 바꾸면 이 칸도 따라 바뀐다.
  const settings: StateKey | null = repositoryConnectionState(health.status, problem);

  const sources = f.surfaces.map((s) => J.planSurfaceImportStatus(s).labelKey);

  // 적재 거부 — `identity`는 `lib/import/run.ts`의 껍데기가 인라인으로 접는다(같은 식의 사본). 보관은 그 앞에서 `archived`로 거부된다.
  let refusal: Observed["refusal"];
  if (archived) refusal = { na: "archived-before-plan" };
  else {
    const plan = J.planRepositoryImport({
      now: T1, readiness, identity: f.repositoryId === null || f.installationId === null ? "unpinned" : "ok",
      repositoryImportToken: null, repositoryImportStartedAt: null, runningSync: null,
      surfaces: f.surfaces.map((s) => ({ id: s.slug, slug: s.slug, archivedAt: null, adapterName: "json-catalog", pathTemplate: "locales/{locale}.json", baseLocale: "en", lastImportStartedAt: null })),
    });
    const sentences: Readonly<Record<string, string>> = en.repositorySync.errors;
    refusal = plan.ok ? { error: "none", tone: "", message: "" }
      : { error: plan.error, tone: planImportRefusal(plan.error).tone, message: Object.hasOwn(sentences, plan.error) ? sentences[plan.error] ?? "" : "" };
  }

  return { list, home, settings, sources, refusal };
}

// ── N/A — 판정이 그 입력 축을 받지 않는다 (타입 고정) ──────────────────────

type Input<F extends (...args: never[]) => unknown> = Parameters<F>[0];
type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;
type SourcesIn = Input<typeof planSurfaceImportStatus>;
type SettingsIn = Input<typeof planConnectionHealth>;
type RefusalIn = ImportPlanInput;
type RefusalSurface = ImportPlanInput["surfaces"][number];

/** 판정이 받지 않는 입력 축 — 근거는 아래 `typeFacts`가 타입으로 고정한다(판정이 그 축을 받기 시작하면 컴파일이 red다). */
const RECEIVES = {
  sources: { connection: false, archived: false, hold: false },
  settings: { failure: false, archived: false, hold: false },
  refusal: { failure: false, probe: false, hold: false },
} as const;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const typeFacts: true[] = [
  true satisfies Exactly<Has<SourcesIn, "installationId"> | Has<SourcesIn, "repositoryId">, false>,
  true satisfies Exactly<Has<SourcesIn, "archivedAt">, false>,
  true satisfies Exactly<Has<SourcesIn, "pending"> | Has<SourcesIn, "openPr">, false>,
  true satisfies Exactly<Has<SettingsIn["project"], "surfaces"> | Has<SettingsIn, "surfaces">, false>,
  true satisfies Exactly<Has<SettingsIn["project"], "archivedAt"> | Has<SettingsIn, "archived">, false>,
  true satisfies Exactly<Has<SettingsIn, "pending"> | Has<SettingsIn, "openPr">, false>,
  true satisfies Exactly<Has<RefusalSurface, "lastImportError">, false>,
  true satisfies Exactly<Has<RefusalIn, "probe">, false>,
  true satisfies Exactly<Has<RefusalIn, "pending"> | Has<RefusalIn, "openPr">, false>,
];

type Column = keyof typeof RECEIVES;
const na = <C extends Column>(column: C, axis: keyof (typeof RECEIVES)[C]) => ({ na: { column, axis: axis as string } });

// ── 행렬 — spec 완료 조건 3의 표 그대로 ─────────────────────────────────────

type HomeCell = { banner: StateKey | null; hold?: HoldReason | null; meta?: StateKey } | { readiness: string };
type Cell<T> = T | { na: { column: Column; axis: string } };
type Row = {
  input: string;
  fixture: Fixture;
  list: { chip: StateKey; banner: StateKey | null };
  home: HomeCell;
  settings: Cell<StateKey | null>;
  sources: Cell<StateKey[]>;
  refusal: Cell<{ error: string; word?: StateKey }> | { readiness: string };
};

const MATRIX: Row[] = [
  {
    // 건강한 프로젝트 — 카나리아가 문제 갈래에서만 서지 않게 연결됨 칸을 하나 둔다(Settings `connected`).
    input: "정상",
    fixture: fixture(),
    list: { chip: "active", banner: null },
    home: { banner: null, hold: null },
    settings: "connected",
    sources: ["synced"],
    refusal: { error: "none" },
  },
  {
    input: "repositoryId null(설치 있음)",
    fixture: fixture({ repositoryId: null }),
    list: { chip: "disconnected", banner: "disconnected" },
    home: { banner: "disconnected" },
    settings: "disconnected",
    sources: na("sources", "connection"),
    refusal: { error: "unpinned", word: "disconnected" },
  },
  {
    // 설치 없음은 readiness가 `setup`이라 Home·적재 거부가 판정에 닿지 않는다 — 적재 거부 칸의 "Not connected 낱말"은 실제로 `not-ready`다(U2 노트).
    input: "설치 없음",
    fixture: fixture({ installationId: null, repositoryId: null, surfaces: [{ ...synced("web"), lastCommitSha: null }] }),
    list: { chip: "setup", banner: "setup" },
    home: { readiness: "setup" },
    settings: "notConnected",
    sources: na("sources", "connection"),
    refusal: { readiness: "not-ready" },
  },
  {
    input: "partial-import",
    fixture: fixture({ surfaces: [partial("web")] }),
    list: { chip: "partiallySynced", banner: "partiallySynced" },
    home: { banner: "partiallySynced" },
    settings: na("settings", "failure"),
    sources: ["partiallySynced"],
    refusal: na("refusal", "failure"),
  },
  {
    input: "import-failed",
    fixture: fixture({ surfaces: [failed("web")] }),
    list: { chip: "syncFailed", banner: "syncFailed" },
    home: { banner: "syncFailed" },
    settings: na("settings", "failure"),
    sources: ["syncFailed"],
    refusal: na("refusal", "failure"),
  },
  {
    input: "표면 A 동기화 중 + B 실패",
    fixture: fixture({ surfaces: [syncing("a"), failed("b")] }),
    list: { chip: "syncFailed", banner: "syncFailed" },
    home: { banner: "syncFailed" },
    settings: na("settings", "failure"),
    sources: ["syncing", "syncFailed"],
    refusal: na("refusal", "failure"),
  },
  {
    input: "표면 A partial + B failed",
    fixture: fixture({ surfaces: [partial("a"), failed("b")] }),
    list: { chip: "syncFailed", banner: "syncFailed" },
    home: { banner: "syncFailed" },
    settings: na("settings", "failure"),
    sources: ["partiallySynced", "syncFailed"],
    refusal: na("refusal", "failure"),
  },
  {
    input: "보관 + repositoryId null",
    fixture: fixture({ archivedAt: T0, repositoryId: null }),
    list: { chip: "archived", banner: null },
    // 배너는 보관이 이기지만 메타 열 Connection은 연결 사실 그대로다 — Settings 배지와 같은 키.
    home: { banner: "archived", hold: null, meta: "disconnected" },
    settings: na("settings", "archived"),
    sources: na("sources", "archived"),
    refusal: { na: { column: "refusal", axis: "archived-before-plan" } },
  },
  {
    input: "unpinned + probe error",
    fixture: fixture({ repositoryId: null, probe: { status: "error" } }),
    list: { chip: "disconnected", banner: "disconnected" },
    home: { banner: "disconnected" },
    settings: "disconnected",
    sources: na("sources", "connection"),
    refusal: na("refusal", "probe"),
  },
  {
    input: "편집 > 0",
    fixture: fixture({ pending: 3, openPr: PR }),
    list: { chip: "active", banner: "unsent" },
    home: { banner: null, hold: "pending-edits" },
    settings: na("settings", "hold"),
    sources: na("sources", "hold"),
    refusal: na("refusal", "hold"),
  },
  {
    input: "편집 0 + PR 열림",
    fixture: fixture({ pending: 0, openPr: PR }),
    list: { chip: "active", banner: "prOpen" },
    home: { banner: null, hold: "open-pr" },
    settings: na("settings", "hold"),
    sources: na("sources", "hold"),
    refusal: na("refusal", "hold"),
  },
  {
    input: "PR 조회 실패 + 편집 > 0",
    fixture: fixture({ pending: 3, openPr: undefined }),
    list: { chip: "active", banner: "unsent" },
    home: { banner: null, hold: "pending-edits" },
    settings: na("settings", "hold"),
    sources: na("sources", "hold"),
    refusal: na("refusal", "hold"),
  },
];

/** 칸 하나의 불일치 목록 — 카나리아도 이것을 센다. */
function mismatches(row: Row, J: Judgments): string[] {
  const got = observe(row.fixture, J);
  const out: string[] = [];
  const cmp = (cell: string, want: unknown, have: unknown) => { if (JSON.stringify(want) !== JSON.stringify(have)) out.push(`${row.input} × ${cell}: want ${JSON.stringify(want)} got ${JSON.stringify(have)}`); };
  const receives = (c: { na: { column: Column; axis: string } }) => {
    const axes: Record<string, boolean> = RECEIVES[c.na.column];
    if (c.na.axis === "archived-before-plan") return;
    if (!Object.hasOwn(axes, c.na.axis) || axes[c.na.axis] !== false) out.push(`${row.input} × ${c.na.column}: N/A without a type fact for ${c.na.axis}`);
  };

  cmp("list", row.list, got.list);

  if ("readiness" in row.home) cmp("home", { na: `readiness:${row.home.readiness}` }, got.home);
  else if ("na" in got.home) cmp("home", row.home, got.home);
  else {
    cmp("home.banner", row.home.banner, got.home.banner);
    if (row.home.hold !== undefined) cmp("home.hold", row.home.hold, got.home.hold);
    // 메타 열 Connection은 Settings 칸과 같은 키다 — 행이 따로 적지 않으면 Settings 칸(문제 갈래) 또는 connected를 기대한다.
    cmp("home.meta", row.home.meta ?? (typeof row.settings === "string" ? row.settings : "connected"), got.home.meta);
    // 버튼은 배너가 보관·연결 문제를 말할 때만 꺼진다 — Home 머리와 번역 화면이 같은 판정이다(🔴 F).
    const off = row.home.banner === "archived" || row.home.banner === "disconnected" || row.home.banner === "notConnected" || row.home.banner === "wrongRepository";
    cmp("home.actions", { publish: !off, sync: !off }, got.home.actions);
  }

  if (row.settings !== null && typeof row.settings === "object") receives(row.settings);
  else cmp("settings", row.settings, got.settings);

  if ("na" in row.sources) receives(row.sources);
  else cmp("sources", row.sources, got.sources);

  if ("readiness" in row.refusal) cmp("refusal", row.refusal.readiness, "na" in got.refusal ? got.refusal.na : got.refusal.error);
  else if ("na" in row.refusal) receives(row.refusal);
  else if ("na" in got.refusal) cmp("refusal", row.refusal.error, got.refusal.na);
  else {
    cmp("refusal.error", row.refusal.error, got.refusal.error);
    if (row.refusal.word !== undefined) {
      const word = STATE[row.refusal.word];
      cmp("refusal.word", true, got.refusal.message.toLowerCase().includes(word.label.toLowerCase()));
      cmp("refusal.tone", word.tone, got.refusal.tone);
    }
  }
  return out;
}

describe("교차 행렬 — 같은 입력은 어느 화면에서도 같은 STATE 키다", () => {
  it("N/A의 타입 사실이 전부 참이다", () => {
    expect(typeFacts.every(Boolean)).toBe(true);
  });

  it.each(MATRIX.map((row) => [row.input, row] as const))("%s", (_input, row) => {
    expect(mismatches(row, REAL)).toEqual([]);
  });

  /** 설치 없음·적재 거부 칸 — 문구가 "끊겼다"로 말하지 않는다(설치 없음은 Disconnected가 아니다, D1). */
  it("설치 없음의 적재 거부 문구는 Disconnected 낱말을 쓰지 않는다", () => {
    expect(en.repositorySync.errors["not-ready"].toLowerCase()).not.toContain(STATE.disconnected.label.toLowerCase());
  });

  /**
   * **표면 0개** — 설치가 있고 활성 표면이 0이면 readiness가 `awaiting_first_sync`다: 목록 칩 Not synced yet·띠 없음, Home은 `ProjectNotReady`,
   * 적재 거부는 `not-ready`. 목록과 Home이 같은 readiness에서 파생되는 것이 불변식이다.
   * ux-drift-unify 지휘자 2026-10-01 — spec 완료 조건 3 표의 'Setup'은 설치 없음 갈래였다.
   */
  describe("표면 0개", () => {
    const zero = fixture({ surfaces: [] });

    it("목록과 Home이 같은 readiness에서 파생된다", () => {
      const got = observe(zero, REAL);
      expect(got.list).toEqual({ chip: "notSyncedYet", banner: null });
      expect(got.home).toEqual({ na: "readiness:awaiting_first_sync" });
      expect(got.refusal).toEqual({ error: "not-ready", tone: "warning", message: en.repositorySync.errors["not-ready"] });
      expect(got.sources).toEqual([]);
    });
  });
});

describe("화면 매핑 사본이 낡지 않았다", () => {
  it("띠의 PR 조회 실패 문장이 Couldn't check 축이다", () => {
    expect(en.projects.banner.prCheckFailed.toLowerCase()).toContain(STATE.couldNotCheck.label.toLowerCase());
  });
});

/**
 * **카나리아** (tasks T27) — 판정 하나를 메모리에서 바꾸면 행렬이 red여야 한다. 소스를 고치지 않고 판정 묶음의 한 칸만 갈아 끼운다
 * (POSTMORTEM 2026-09-16 — 뮤테이션을 되돌리는 `git checkout`이 미커밋 작업을 지웠다).
 */
describe("카나리아", () => {
  const total = (J: Judgments) => MATRIX.flatMap((row) => mismatches(row, J));

  it("connectionProblem이 unpinned를 미연결로 접으면 Home·Settings·Home 메타 칸이 red다", () => {
    const flipped: Judgments = { ...REAL, connectionProblem: (status) => (status === "unpinned" ? "not-connected" : connectionProblem(status)) };
    const red = total(flipped);
    expect(red.some((line) => line.startsWith("repositoryId null(설치 있음) × settings"))).toBe(true);
    expect(red.some((line) => line.startsWith("unpinned + probe error × home.banner"))).toBe(true);
    expect(red.some((line) => line.startsWith("unpinned + probe error × home.meta"))).toBe(true);
  });

  it("worstFailingSurface가 첫 실패를 고르면 A partial + B failed의 Home 칸이 red다", () => {
    const flipped: Judgments = {
      ...REAL,
      worstFailingSurface: ((surfaces) => {
        const first = surfaces.find((s) => s.importError !== null && !s.importing);
        return first === undefined ? null : { ...first, importError: first.importError as ImportFailureCode };
      }) as Judgments["worstFailingSurface"],
    };
    expect(total(flipped)).toEqual([expect.stringContaining("표면 A partial + B failed × home.banner")]);
  });

  it("바꾸지 않은 묶음은 red가 0이다", () => {
    expect(total(REAL)).toEqual([]);
  });
});
