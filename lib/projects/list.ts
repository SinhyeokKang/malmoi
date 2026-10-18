import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { repoConnectionPinned } from "@/lib/repo-host/target";
import { tokenExpiryState } from "@/lib/status/token-expiry";
import { importFailureTone } from "@/lib/projects/import-failure";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import { matchesAllTokens, searchTokens } from "@/lib/search/match";
import type { ProjectTodo } from "@/lib/inbox/project-todos";
import type { StateKey } from "@/lib/status/canon";

/**
 * 프로젝트 목록의 순수 판정 (8-3).
 *
 * 좁히는 축은 **검색 하나**다(`?q=`). ⚠️ **거르는 쪽은 클라이언트다** (audit-ux #17) — 목록이 이미 받은 행을
 * 이 파일의 순수 함수로 거르고 주소는 `history.replaceState`로만 맞춘다(`useProjectQuery`). 주소창이 값을
 * 들므로 뒤로가기·공유·새로고침은 그대로 되고, 서버 왕복(원격 신호 최대 8초)은 검색의 임계 경로에서 빠졌다.
 * 그래서 이 파일은 클라이언트 그래프에 실린다 — I/O·서버 전용 import를 들이지 않는다.
 *
 * ⚠️ **필터 탭 여섯이 2026-09-13에 사라졌다** (DESIGN §6.63). 상태는 이제 **그룹**이 말한다 —
 * 탭은 "무엇을 숨길까"를 사용자에게 물었고, 그 질문의 답이 대개 "아무것도"였다. 되돌아올 조건은
 * 정해져 있다: `Archived`가 쌓이면 `All / Archived` **둘로만**이고 상태 다섯을 되살리지 않는다.
 */

/**
 * 상태 다섯. **순서는 그대로 "가장 흔한 것이 먼저"다** — 탭이 사라지면서 이 배열이 UI 순서를 정하는
 * 자리는 아니게 됐지만(그 일은 이제 그룹이 한다), 갈래의 정본이라는 뜻은 남는다.
 *
 * ⚠️ **`Active`가 앞이고 `Archived`가 끝이다.** 가운데 셋은 "손볼 것"이고, 보관은 의도적으로 멈춘
 * 것이라 훑는 눈에서 가장 멀어야 한다.
 */
export const PROJECT_STATUSES = ["active", "setup", "awaiting_first_sync", "needs_reconnect", "archived"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** `projectStatus`가 보는 네 컬럼. 그룹·띠 판정도 같은 것을 받는다 — 판정이 한 곳이라야 한다. */
export type ProjectStatusInput = {
  archivedAt: Date | null;
  repoHost: string; installationId: string | null; gitlabConnectionId: string | null;
  surfaces: readonly { archivedAt: Date | null; lastCommitSha: string | null }[];
  repositoryId: string | null;
  /**
   * GitLab 프로젝트가 참조하는 연결의 저장 만료일(D24) — 지났으면 원격 호출 없이 끊김이다(Home·설정의 `connection-unusable`과 같은 결론을 목록·Inbox가
   * DB만으로 낸다). 원격으로만 아는 철회·접근 상실은 목록이 모른다(GitHub `app-uninstalled`과 같은 선례). GitHub·연결 없음은 `null`이다.
   * ⚠️ **필수다**(audit E11) — 선택 필드였을 땐 새 생산자가 빠뜨리면 만료된 GitLab 프로젝트가 `active`로 보이는데 typecheck가 침묵했다.
   */
  gitlabTokenExpiresAt: Date | null;
};

/**
 * 이름으로 좁힌다 (2026-09-11 사용자 — 목록 툴바의 검색).
 *
 * ⚠️ **대상이 이름 하나다.** slug·리포 URL·역할까지 훑으면 "왜 이 행이 나왔나"에 답할 것이 화면에
 * 없다 — 행에 보이는 것 중 질의와 맞은 자리를 사용자가 못 찾는다. 번역 화면의 `q`가 키와 값을 함께
 * 보는 것은 그 둘이 **같은 행에 나란히 보여서**이고, 여기는 그렇지 않다.
 *
 * ⚠️ **빈 질의는 전부다** — `undefined`와 `""`와 공백만인 문자열이 같은 뜻이라야, 검색창을 비우는
 * 것과 URL에서 키를 빼는 것이 같은 화면을 준다.
 *
 * ⚠️ **원본을 건드리지 않는다** — 호출부가 같은 배열로 총계도 세므로, 제자리에서 잘라내면 제목 옆
 * 숫자가 질의에 따라 달라진다(총계는 좁히기 전의 값이어야 한다).
 *
 * ⚠️ **대조는 토큰 AND다**(search-ux-unify D1) — 검색 Dialog·LNB 스위처와 같은 `matchesAllTokens`라 같은 질의에 같은 답을 한다.
 */
export function searchProjects<T extends { name: string }>(rows: readonly T[], q: string | undefined): T[] {
  const tokens = searchTokens(q ?? "");
  return rows.filter((row) => matchesAllTokens(row.name, tokens));
}

/**
 * 행 우측 배지의 갈래 (8-3 시안 개정).
 *
 * ⚠️ **`ready`가 침묵이 아니라 `Active`다.** DESIGN §6.1("가장 흔한 상태가 가장 조용하다")의 예외이고
 * 근거는 **이 목록이 훑어보는 화면**이라는 것 — 손볼 프로젝트가 튀어나오려면 정상인 것도 색을 들어
 * 대비가 생겨야 한다. 배지가 항상 하나라 행 우측 폭도 흔들리지 않는다.
 *
 * ⚠️ 전 근거는 "필터 탭이 같은 낱말을 쓴다"였는데 **그 탭이 2026-09-13에 사라졌다.** 판정은 그대로
 * 두고 근거만 고친다 — 배지가 말하는 축은 이제 그룹 헤더가 되비춘다.
 *
 * ⚠️ **보관이 readiness보다 앞이다** — 멈춘 프로젝트에서 "첫 적재를 기다리는 중"은 답할 질문이
 * 아니다 (`planProjectAccess`가 권한 → 보관 순으로 보는 것과 같은 결).
 */
export function projectStatus(row: ProjectStatusInput, now: Date = new Date()): ProjectStatus {
  if (row.archivedAt !== null) return "archived";
  const readiness = planProjectReadiness(row);
  if (readiness !== "ready") return readiness;
  /**
   * ⚠️ **`repositoryId`는 readiness의 축이 아니라 셋째 축이다** (PRODUCT §7.5). sec-audit-2 이전에
   * 만들어진 행은 그 컬럼이 null이고, 결과는 **Publish만 조용히 거부되는 것**이다 — 야간 순회에서도
   * 빠지는데(`selectPullTargets`) 목록은 여태 `Active`를 보였다.
   *
   * ⚠️ **`ready`일 때만 본다.** 첫 적재조차 안 끝난 프로젝트에서 "다시 연결하라"는 답할 질문이
   * 아니다 — 이 컬럼이 막는 것은 **되돌려보내기**이고, ready가 아니면 되돌려보낼 것이 없다.
   */
  // GitLab은 연결 참조가 빈 행도 여기다(연결자가 떠났다 — gitlab-repositories). GitHub은 지금처럼 리포 id 하나다.
  if (!repoConnectionPinned(row)) return "needs_reconnect";
  // 만료 임박(14일)은 목록 상태가 아니다 — 연결은 정상이라 `Active`이고, 임박은 토큰의 자리(`/account`·설정 카드)가 말한다(design §2 톤 표).
  if (row.repoHost === "gitlab" && tokenExpiryState(row.gitlabTokenExpiresAt, now) === "expired") return "needs_reconnect";
  return "active";
}

/**
 * ── 목록 행의 판정 (DESIGN §6.63) ──────────────────────
 *
 * ⚠️ **전부 이 파일에 둔다.** 오케스트레이션 파일(`lib/keys/query.ts`)에 두면 클라이언트 번들이
 * 그 그래프를 따라온다 (ARCHITECTURE §0 말미 · `client-graph.test.ts`).
 *
 * ⚠️ **칩·그룹·띠는 `planProjectRow` 한 표에서 나온다** (project-row-redesign design §2). 생산자 없는 갈래를 union에
 * 남기지 않는 것이 이 리포의 규칙이다.
 */

/**
 * 표면 하나의 적재 상태 — 행은 이것을 **표면 배열 그대로** 든다(ux-drift-unify §3.2). 평탄화(`find` · `some`)하면 표면 A가 동기화 중일 때
 * 표면 B의 실패가 통째로 가려졌다(🔴 E). 판정은 `projectSyncFailure` 하나가 한다.
 */
export type SurfaceImportState = {
  /** 마지막으로 수신한 임포트 실패. */
  importError: ImportFailureCode | null;
  /** 서버 적재가 지금 돌고 있나. */
  importing: boolean;
};

/** 행이 아는 사건들. DB 집계와 GitHub 조회가 채우고, 조회가 실패하면 원격 둘이 "없음"으로 온다. */
export type ProjectEvents = {
  /** 검토 대기 셀 수. */
  review: number;
  /** 안 보낸 편집 수 — `countPending`과 **같은 술어**의 결과다. */
  unsent: number;
  /**
   * 열린 PR. ⚠️ **`state === "open"`을 확인한 뒤에만 채운다.** `undefined`는 **확인 못 함**이고 "없음"(`null`)이 아니다(ux-drift-unify Q6) —
   * 열린 PR 게이트가 fail-closed라 그 동안 적재가 실제로 멈춘다.
   */
  openPr: { number: number; url: string } | null | undefined;
  /** base가 앞선 **로케일 파일 수**. ⚠️ 키 수가 아니다 (C′) — 서버는 리포의 키를 모른다. */
  repoAheadFiles: number;
};

export type ProjectGroup = "needs_attention" | "all_set" | "archived";

/** 그룹 순서 — **손볼 것이 먼저다.** 이 배열이 곧 화면의 목차 순서다. */
const GROUP_ORDER = ["needs_attention", "all_set", "archived"] as const satisfies readonly ProjectGroup[];

/** 판정 셋이 받는 행 — `surfaces`가 readiness 두 컬럼과 적재 상태를 함께 든다. */
export type RowInput = Omit<ProjectStatusInput, "surfaces"> & ProjectEvents & {
  surfaces: readonly (ProjectStatusInput["surfaces"][number] & SurfaceImportState)[];
};

/**
 * ⚠️ **"지금 돌고 있다"가 "지난번에 실패했다"를 이긴다.** `lastImportStartedAt`이 서 있다는 것은 새
 * 실행이 시작됐다는 뜻이고, 남아 있는 코드는 이전 실행의 것이다 — 끝나면 성공이 비우거나 실패가
 * 덮어쓴다. 이 한 줄이 칩·그룹·띠 셋에서 같은 뜻으로 쓰인다.
 */
export function failing(row: SurfaceImportState): boolean {
  return row.importError !== null && !row.importing;
}

/**
 * **표면별로 `failing`을 적용한 뒤 가장 나쁜 표면 하나** (ux-drift-unify §3.2). 급은 `importFailureTone` 순(danger > warning)이고,
 * 같은 급이면 먼저 온 표면이다 — 호출부가 slug 순으로 넘기므로 결정적이다. 목록 행 판정(`planProjectRow`)과 Home 배너가 이것 하나를 부른다.
 */
export function worstFailingSurface<T extends SurfaceImportState>(surfaces: readonly T[]): (T & { importError: ImportFailureCode }) | null {
  let worst: (T & { importError: ImportFailureCode }) | null = null;
  for (const surface of surfaces) {
    const code = surface.importError;
    if (code === null || !failing(surface)) continue;
    if (worst === null || (importFailureTone(code) === "danger" && importFailureTone(worst.importError) !== "danger")) worst = { ...surface, importError: code };
  }
  return worst;
}

export function projectSyncFailure(surfaces: readonly SurfaceImportState[]): ImportFailureCode | null {
  return worstFailingSurface(surfaces)?.importError ?? null;
}

/**
 * 행 아래 띠 — **겹치면 하나만** (DESIGN §6.63의 띠 항). 고르는 것은 `planProjectRow`다.
 *
 * ⚠️ **역할을 받지 않는다** (F). 시안의 Editor 갈래(*"…waiting for an owner to send them."*)는 버렸다 —
 * PRODUCT §3이 **EDITOR에게도 Publish를 허용**하므로 그 문구는 화면이 권한을 실제보다 좁혀 말하는 것이다.
 * 링크가 역할로 갈리는 둘(`Reconnect`·`Continue setup`)의 판정은 **호출부**가 `row.role`로 한다.
 */
export type RowBanner =
  | { kind: "needs_reconnect" }
  | { kind: "import_failed"; reason: ImportFailureCode }
  | { kind: "setup" }
  /** F: 역할로 갈리지 않는다. */
  | { kind: "unsent"; count: number }
  | { kind: "pr_open"; number: number; url: string }
  /** 열린 PR을 확인하지 못했다 — 같은 신호의 모름이라 `pr_open` 자리에 선다(ux-drift-unify Q6). */
  | { kind: "pr_check_failed" }
  /** C′: 키가 아니라 **로케일 파일** 수다. */
  | { kind: "repo_ahead"; files: number }
  | { kind: "review"; count: number }
  /** 값이 하나도 없는 작업 언어 — Home Attention·Inbox의 같은 항목이다. 여럿이면 attention 정렬의 첫 하나이고 나머지는 Inbox가 든다. */
  | { kind: "never_filled"; surfaceSlug: string; code: string; name: string; keys: number }
  | null;

/**
 * 행 하나의 판정 셋 — 칩·그룹·띠가 **한 표에서** 나온다(project-row-redesign design §2). 함수 넷이 각자 우선순위를 갖던 때는
 * 미발송 행이 칩 `Active`인데 그룹 `Needs attention`이었다.
 */
export type ProjectRowPlan = {
  /** `StatusBadge` 입력 — 낱말·톤은 `STATE`가 든다(DESIGN §2.4). */
  chip: StateKey;
  group: ProjectGroup;
  banner: RowBanner;
};

/**
 * **칩은 건강, 띠는 할 일이다.** 그룹은 칩에서 기계적으로 나온다(`active` = `All set`) — 정상 프로젝트의 할 일(미발송·열린 PR·PR 조회 실패·
 * 리포 앞섬·검토·빈 언어)은 칩과 그룹을 바꾸지 않고 띠에만 선다.
 *
 * ⚠️ **PR 조회 실패는 건강이 아니다**(2026-10-15 사용자) — 이번 요청이 PR을 확인하지 못했다는 일시적인 모름이고, 원격 마감을 넘기면 PR 번호를
 * 가진 행 전부가 한꺼번에 그 상태가 된다.
 */
export function planProjectRow(row: RowInput, todos: readonly ProjectTodo[]): ProjectRowPlan {
  const status = projectStatus(row);
  // 보관은 사건과 무관하다 — 멈춘 프로젝트에 "지금 뭘 하면 되나"는 답할 질문이 아니다.
  if (status === "archived") return { chip: "archived", group: "archived", banner: null };
  // 끊긴 연결은 모든 것을 덮는다 — 그 밑의 사건은 전부 손댈 수 없는 상태다.
  if (status === "needs_reconnect") return { chip: "disconnected", group: "needs_attention", banner: { kind: "needs_reconnect" } };
  const failure = projectSyncFailure(row.surfaces);
  if (failure !== null) return { chip: importFailureTone(failure) === "danger" ? "syncFailed" : "partiallySynced",
    group: "needs_attention", banner: { kind: "import_failed", reason: failure } };
  // 설정은 EDITOR의 Inbox에서 빠져도 행에서는 소유자에게 요청할 수 있다.
  if (status === "setup") return { chip: "setup", group: "needs_attention", banner: { kind: "setup" } };
  // 첫 적재 전은 띠가 없다 — 칩이 상태를 말한다(둘째 줄이 사라졌다).
  if (status === "awaiting_first_sync") return { chip: row.surfaces.some(surface => surface.importing) ? "syncing" : "notSyncedYet",
    group: "needs_attention", banner: null };
  const unsent = todos.find(todo => todo.kind === "unsent");
  const review = todos.filter(todo => todo.kind === "review").reduce((sum, todo) => sum + todo.count, 0);
  const blank = todos.find(todo => todo.kind === "never_filled");
  // E: 머지만 남은 프로젝트도 편집이 남아 있으면 그 사실을 먼저 본다.
  const banner: RowBanner = unsent ? { kind: "unsent", count: unsent.count }
    : row.openPr === undefined ? { kind: "pr_check_failed" }
    : row.openPr !== null ? { kind: "pr_open", number: row.openPr.number, url: row.openPr.url }
    : row.repoAheadFiles > 0 ? { kind: "repo_ahead", files: row.repoAheadFiles }
    : review > 0 ? { kind: "review", count: review }
    : blank ? { kind: "never_filled", surfaceSlug: blank.surfaceSlug, code: blank.code, name: blank.name, keys: blank.keys }
    : null;
  return { chip: "active", group: "all_set", banner };
}

/** ③의 groupBy 결과 한 줄. */
export type LocaleCellCount = { projectId: string; surfaceId: string; localeCode: string; needsReview: boolean; count: number };

/** ①의 한 줄 — 살아 있는 로케일만 온다. */
export type LiveLocale = { projectId: string; surfaceId: string; surfaceSlug: string; code: string; isBase: boolean };

/** 프로젝트와 로케일을 한 키로. **구분자가 값에 못 들어가는 문자**라야 두 축이 섞이지 않는다. */
const cellKey = (projectId: string, surfaceId: string, code: string): string => `${projectId}\u0000${surfaceId}\u0000${code}`;

/**
 * ③을 ①의 **살아 있는 (projectId, code)** 로 거른 뒤 접는다.
 *
 * ⚠️ **이 필터가 없으면 orphaned 로케일의 번역이 분자에 들어간다** — 분모(키)는 orphaned를 빼므로
 * 분자가 분모보다 커진다.
 */
function foldCells(
  locales: readonly LiveLocale[],
  cells: readonly LocaleCellCount[],
): Map<string, { done: number; review: number }> {
  const live = new Set(locales.map((l) => cellKey(l.projectId, l.surfaceId, l.code)));
  const out = new Map<string, { done: number; review: number }>();
  for (const cell of cells) {
    const key = cellKey(cell.projectId, cell.surfaceId, cell.localeCode);
    if (!live.has(key)) continue;
    const acc = out.get(key) ?? { done: 0, review: 0 };
    // 검토 대기를 완료로 세지 않는다 — 두 구간이 겹치면 바의 폭 합이 100%를 넘는다.
    if (cell.needsReview) acc.review += cell.count;
    else acc.done += cell.count;
    out.set(key, acc);
  }
  return out;
}

/**
 * 프로젝트별 검토 대기를 **(표면, 로케일) 단위로** — `foldCells` 한 번의 결과다. 행의 `review` 합과 띠의 검토 할 일이 이것 하나를 읽는다:
 * 호출부가 셀을 손으로 다시 거르면 "살아 있는 로케일만"이라는 규칙이 두 벌이 되고 띠의 수와 `review`가 갈린다(project-row-redesign RA 🟡).
 */
export function rowReviewCells(
  locales: readonly LiveLocale[],
  cells: readonly LocaleCellCount[],
): Map<string, { surfaceId: string; code: string; count: number }[]> {
  const out = new Map<string, { surfaceId: string; code: string; count: number }[]>();
  for (const [key, cell] of foldCells(locales, cells)) {
    if (cell.review === 0) continue;
    const [projectId = "", surfaceId = "", code = ""] = key.split("\u0000");
    out.set(projectId, [...(out.get(projectId) ?? []), { surfaceId, code, count: cell.review }]);
  }
  return out;
}

/**
 * 프로젝트별 검토 대기의 **로케일별 분해** (DESIGN §6.64 — 카드 보조 줄 `5 en, 3 ja`).
 *
 * ⚠️ **`rowReviewCells`와 같은 `foldCells`를 쓴다** — "살아 있는 로케일만"이라는 규칙이 한 벌로
 * 남아야 두 수가 갈리지 않는다. 표면은 가로지른다: 카드의 수가 프로젝트 합계라 분해도 같은
 * 모집단이어야 한다.
 *
 * ⚠️ **건수 내림차순이다** — 보조 줄이 폭에 따라 뒤부터 잘리므로 큰 수가 화면에 남아야 한다.
 * 동점은 코드 유닛 비교다(`localeCompare`는 로케일 설정에 따라 답이 달라진다).
 */
export function reviewByLocale(
  locales: readonly LiveLocale[],
  cells: readonly LocaleCellCount[],
): Map<string, { code: string; count: number }[]> {
  const byProject = new Map<string, Map<string, number>>();
  for (const [key, cell] of foldCells(locales, cells)) {
    if (cell.review === 0) continue;
    const projectId = key.slice(0, key.indexOf("\u0000"));
    const code = key.slice(key.lastIndexOf("\u0000") + 1);
    const perLocale = byProject.get(projectId) ?? new Map<string, number>();
    perLocale.set(code, (perLocale.get(code) ?? 0) + cell.review);
    byProject.set(projectId, perLocale);
  }
  return new Map(
    [...byProject].map(([projectId, perLocale]) => [
      projectId,
      [...perLocale]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || (a.code === b.code ? 0 : a.code < b.code ? -1 : 1)),
    ]),
  );
}

export type SummaryQueue = { newFromGithub: number; toTranslate: number; toReview: number; toSend: number };

/**
 * ⚠️ **소비자가 지금 없다 — 지우지 않는다** (2026-09-15). 목록 머리의 Summary 넷이 사라지면서
 * 이 함수를 부르는 화면이 0이 됐고, Home의 카운트 카드 넷이 그것을 받는다 (DESIGN §6.63·§6.64).
 *
 * ⚠️ **지웠다 다시 만들면 미발송 술어의 넷째 벌을 만드는 셈이다** — CLAUDE.md가 금지하고,
 * `pnpm test:projects:postgres`가 셋이 같은 행을 세는지 재는 유일한 자리다. `/code-review`·`/audit`이
 * 이것을 "미사용"으로 올릴 것을 예상한다: **의도된 상태다.**
 *
 * ⚠️ **블록을 둘로 나누지 않는다** — TS는 선언 바로 앞 **마지막** 블록만 붙이므로, 위 경고를 별도
 * 블록으로 두면 hover·IntelliSense에 아래 설명만 뜬다. 그 경고를 읽어야 하는 사람이 보는 자리가 거기다.
 *
 * ── 계정 합계 넷 (DESIGN §6.63의 Summary 항). **검색 전 전체 멤버십 중 보관하지 않은 프로젝트**의 값이고,
 * 검색·그룹에 흔들리지 않는다.
 *
 * ⚠️ **로케일을 자르지 않는다** — 59로케일 리포에서 넷째 로케일부터의 미번역이 통째로
 * 사라지면 안 된다 (`i18n-many-locales`가 그 실물이다). 전부 같은 입력에서 센다.
 *
 * ⚠️ **보관은 네 값 모두에서 빠진다** (2026-09-13 사용자). 행·제목 총계·그룹 카운트는 남는다 —
 * 빠지는 것은 "지금 내가 할 일"의 합계뿐이다.
 */
export function summaryQueue(input: {
  projects: readonly { projectId: string; archived: boolean }[];
  locales: readonly LiveLocale[];
  keyTotals: ReadonlyMap<string, number>;
  cells: readonly LocaleCellCount[];
  /** 마지막 pull 이후 추가된 활성 키 수 (raw ④). */
  newKeys: ReadonlyMap<string, number>;
  /** 안 보낸 편집 수 (raw ⑤). */
  unsent: ReadonlyMap<string, number>;
}): SummaryQueue {
  const active = new Set(input.projects.filter((p) => !p.archived).map((p) => p.projectId));
  const locales = input.locales.filter((l) => active.has(l.projectId));
  const counted = foldCells(locales, input.cells);

  let filled = 0;
  let toReview = 0;
  for (const [, cell] of counted) {
    filled += cell.done + cell.review;
    toReview += cell.review;
  }

  const localeCount = new Map<string, number>();
  for (const locale of locales) localeCount.set(locale.surfaceId, (localeCount.get(locale.surfaceId) ?? 0) + 1);

  let cells = 0;
  for (const [projectId, count] of localeCount) cells += (input.keyTotals.get(projectId) ?? 0) * count;

  const sum = (map: ReadonlyMap<string, number>): number => {
    let total = 0;
    for (const id of active) total += map.get(id) ?? 0;
    return total;
  };

  return {
    newFromGithub: sum(input.newKeys),
    // 음수를 내지 않는다 — 셀 수가 칸 수를 넘는 일은 없어야 하지만, 넘겨도 화면이 마이너스를 말하지 않는다.
    toTranslate: Math.max(0, cells - filled),
    toReview,
    toSend: sum(input.unsent),
  };
}

/**
 * 그룹으로 나눈다 — **검색 중에는 평평하다** (DESIGN §6.63의 검색 항).
 *
 * ⚠️ **질의가 있으면 그룹을 그리지 않는다.** 결과가 셋으로 흩어지면 "몇 개 찾았나"를 사용자가 더해야
 * 하고, 그 화면이 답할 질문은 "어느 그룹인가"가 아니라 "찾았나"다.
 *
 * ⚠️ **빈 그룹은 헤더를 만들지 않는다** — 세 헤더가 이 화면의 목차인데 `Archived 0`이 상시로 서면
 * 목차가 아니라 배경이 된다.
 *
 * ⚠️ **입력 배열을 건드리지 않는다** — 호출부가 같은 배열로 총계도 센다.
 */
export function groupProjects<T extends { plan: ProjectRowPlan }>(
  rows: readonly T[],
  q: string | undefined,
): { flat: true; rows: T[] } | { flat: false; groups: [ProjectGroup, T[]][] } {
  if ((q ?? "").trim() !== "") return { flat: true, rows: [...rows] };
  const buckets = new Map<ProjectGroup, T[]>();
  for (const row of rows) {
    const group = row.plan.group;
    const list = buckets.get(group) ?? [];
    list.push(row);
    buckets.set(group, list);
  }
  return {
    flat: false,
    groups: GROUP_ORDER.flatMap((group) => {
      const list = buckets.get(group);
      return list === undefined || list.length === 0 ? [] : [[group, list] as [ProjectGroup, T[]]];
    }),
  };
}

/**
 * **본문이 네 모양 중 어느 것인가** — 아트보드 `1a`~`1d`와 1:1 (DESIGN §6.63).
 *
 * ⚠️ **갈래를 한 자리에 모은다.** 전에는 `hasProjects`·질의·건수가 JSX 안에서 섞여 판정됐고, 그러면
 * 넷 중 하나가 바뀔 때 나머지 셋이 어떤 모양이 되는지를 화면을 읽어야만 알 수 있었다.
 *
 * ⚠️ **`empty`와 `no-results`를 한 갈래로 합치지 않는다** — 출구의 무게가 반대다. 프로젝트가 없을
 * 때의 출구는 **만들기**(채운 버튼)이고 검색이 빈 것의 출구는 **되돌리기**(링크)다. 합치면 그 차이를
 * 그리는 자리가 사라진다.
 *
 * ⚠️ **`results`는 그룹을 나누지 않는다** — 결과 1건에 헤더 셋이면 둘이 빈 카드가 된다. 상태는
 * 행의 칩이 계속 말한다.
 */
export type ListBody<T> =
  | { kind: "groups"; cards: { group: ProjectGroup; rows: T[] }[] }
  | { kind: "empty" }
  | { kind: "results"; query: string; rows: T[] }
  | { kind: "no-results"; query: string };

export function listBody<T extends { plan: ProjectRowPlan; name: string }>(
  all: readonly T[],
  q: string | undefined,
): ListBody<T> {
  /**
   * ⚠️ **프로젝트가 0건이면 질의보다 앞선다.** 머리가 검색을 그리지 않으므로 질의는 주소창으로만
   * 오는데, 그 사람에게 줄 출구는 "검색을 되돌려라"가 아니라 **"만들어라"**다.
   */
  if (all.length === 0) return { kind: "empty" };

  // 빈 문자열·공백만·`undefined`가 같은 뜻이라야 검색창을 비우는 것과 URL에서 키를 빼는 것이 같다.
  const query = (q ?? "").trim();
  if (query !== "") {
    const rows = searchProjects(all, query);
    return rows.length === 0 ? { kind: "no-results", query } : { kind: "results", query, rows };
  }

  const grouped = groupProjects(all, undefined);
  /**
   * ⚠️ **질의를 `undefined`로 넘겼으므로 `flat`일 수 없다.** 타입을 좁히는 자리인데 `?? []`로 접으면
   * `groupProjects`가 언젠가 flat을 내는 날 **카드도 빈 상태도 없는 백지**가 조용히 나온다 —
   * 아무도 red를 못 본다. 도달 불가를 시끄럽게 둔다.
   */
  if (grouped.flat) throw new Error("listBody: groupProjects returned a flat list without a query");
  return { kind: "groups", cards: grouped.groups.map(([group, rows]) => ({ group, rows })) };
}

