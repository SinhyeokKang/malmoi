import { planProjectReadiness } from "@/lib/onboarding/readiness";
import type { ImportFailureCode } from "@/lib/projects/import-status";

/**
 * 프로젝트 목록의 순수 판정 (8-3).
 *
 * 좁히는 축은 **검색 하나**다(`?q=`) — 클라이언트 상태가 아니라 서버가 이미 걸러 그린다. 그래야
 * 뒤로가기·공유·새로고침이 그냥 되고, `logs`의 `?cursor=`와 같은 관용구다.
 *
 * ⚠️ **필터 탭 여섯이 2026-09-13에 사라졌다** (projects-list §1). 상태는 이제 **그룹**이 말한다 —
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
  installationId: string | null;
  surfaces: readonly { archivedAt: Date | null; lastCommitSha: string | null }[];
  repositoryId: string | null;
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
 */
export function searchProjects<T extends { name: string }>(rows: readonly T[], q: string | undefined): T[] {
  const needle = (q ?? "").trim().toLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
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
export function projectStatus(row: ProjectStatusInput): ProjectStatus {
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
  return row.repositoryId === null ? "needs_reconnect" : "active";
}

/**
 * ── 목록 재설계의 판정 여섯 (DESIGN §6.63) ──────────────────────
 *
 * ⚠️ **전부 이 파일에 둔다.** 오케스트레이션 파일(`lib/keys/query.ts`)에 두면 클라이언트 번들이
 * 그 그래프를 따라온다 (ARCHITECTURE §0 말미 · `client-graph.test.ts`).
 *
 * ⚠️ **캔버스 `1c`의 상태표가 정본이다** (DESIGN §6.63). 옛 union 스케치와 어긋나는
 * 자리가 하나 있고(첫 적재 대기의 띠), **표를 따른다**: 그 상태의 문장은 Meter 자리가 들고 띠는 비운다.
 * 생산자 없는 갈래를 union에 남기지 않는 것이 이 리포의 규칙이기도 하다.
 */

/** 행이 아는 사건들. DB 집계와 GitHub 조회가 채우고, 조회가 실패하면 원격 둘이 "없음"으로 온다. */
export type ProjectEvents = {
  /** 검토 대기 셀 수. */
  review: number;
  /** 안 보낸 편집 수 — `countUnpublished`와 **같은 술어**의 결과다. */
  unsent: number;
  /** 열린 PR. ⚠️ **`state === "open"`을 확인한 뒤에만 채운다.** */
  openPr: { number: number; url: string } | null;
  /** base가 앞선 **로케일 파일 수**. ⚠️ 키 수가 아니다 (C′) — 서버는 리포의 키를 모른다. */
  repoAheadFiles: number;
  /** 마지막으로 수신한 임포트 실패. */
  importError: ImportFailureCode | null;
  /** 서버 적재가 지금 돌고 있나. */
  importing: boolean;
};

export type ProjectGroup = "needs_attention" | "all_set" | "archived";

/** 그룹 순서 — **손볼 것이 먼저다.** 이 배열이 곧 화면의 목차 순서다. */
const GROUP_ORDER = ["needs_attention", "all_set", "archived"] as const satisfies readonly ProjectGroup[];

type RowInput = ProjectStatusInput & ProjectEvents;

/**
 * ⚠️ **"지금 돌고 있다"가 "지난번에 실패했다"를 이긴다.** `lastImportStartedAt`이 서 있다는 것은 새
 * 실행이 시작됐다는 뜻이고, 남아 있는 코드는 이전 실행의 것이다 — 끝나면 성공이 비우거나 실패가
 * 덮어쓴다. 이 한 줄이 그룹·띠·Meter 셋에서 같은 뜻으로 쓰인다.
 */
export function failing(row: { importError: ImportFailureCode | null; importing: boolean }): boolean {
  return row.importError !== null && !row.importing;
}

/**
 * 행이 어느 그룹에 서는가 (DESIGN §6.63의 그룹 항).
 *
 * ⚠️ **검토 대기와 열린 PR은 `All set`이다.** 둘 다 "읽고 누르면 되는 것"이고, 여기서 손볼 것으로
 * 올리면 정상 운영 중인 프로젝트가 상시 `Needs attention`에 남아 그 그룹이 의미를 잃는다.
 */
export function projectGroup(row: RowInput): ProjectGroup {
  const status = projectStatus(row);
  if (status === "archived") return "archived";
  if (status !== "active") return "needs_attention";
  if (failing(row)) return "needs_attention";
  return row.unsent > 0 || row.repoAheadFiles > 0 ? "needs_attention" : "all_set";
}

/**
 * 행 아래 띠 — **겹치면 하나만** (DESIGN §6.63의 띠 항).
 *
 * ⚠️ **역할을 받지 않는다** (F). 시안의 Editor 갈래(*"…waiting for an owner to send them."*)는 버렸다 —
 * PRODUCT §3이 **EDITOR에게도 Publish를 허용**하므로 그 문구는 화면이 권한을 실제보다 좁혀 말하는 것이다.
 * 링크가 역할로 갈리는 셋(`Reconnect`·`Continue setup`·`View details`)의 판정은 **호출부**가
 * `row.role`로 한다 — 띠를 순수하게 유지하는 것이 이 매트릭스를 반으로 줄인다.
 */
export type RowBanner =
  | { kind: "needs_reconnect" }
  | { kind: "import_failed"; reason: ImportFailureCode }
  | { kind: "setup" }
  /** F: 역할로 갈리지 않는다. */
  | { kind: "unsent"; count: number }
  | { kind: "pr_open"; number: number; url: string }
  /** C′: 키가 아니라 **로케일 파일** 수다. */
  | { kind: "repo_ahead"; files: number }
  | { kind: "review"; count: number }
  | null;

export function rowBanner(row: RowInput): RowBanner {
  const status = projectStatus(row);
  // 보관은 사건과 무관하다 — 멈춘 프로젝트에 "지금 뭘 하면 되나"는 답할 질문이 아니다.
  if (status === "archived") return null;
  // 끊긴 연결은 모든 것을 덮는다 — 그 밑의 사건은 전부 손댈 수 없는 상태다.
  if (status === "needs_reconnect") return { kind: "needs_reconnect" };
  if (failing(row) && row.importError !== null) return { kind: "import_failed", reason: row.importError };
  if (status === "setup") return { kind: "setup" };
  // ⚠️ 첫 적재 대기는 띠가 없다 (DESIGN §6.63) — 그 문장은 Meter 자리가 든다.
  if (status === "awaiting_first_sync") return null;
  // E: 머지만 남은 프로젝트도 편집이 남아 있으면 그 사실을 먼저 본다.
  if (row.unsent > 0) return { kind: "unsent", count: row.unsent };
  if (row.openPr !== null) return { kind: "pr_open", number: row.openPr.number, url: row.openPr.url };
  if (row.repoAheadFiles > 0) return { kind: "repo_ahead", files: row.repoAheadFiles };
  if (row.review > 0) return { kind: "review", count: row.review };
  return null;
}

/**
 * 한 로케일의 두 구간.
 *
 * ⚠️ **`done`에 검토 대기가 없다** — 바의 두 폭이 겹치면 합이 100%를 넘는다.
 *
 * ⚠️ **`percent`는 그 둘의 합이다** (캔버스 `1c`: `done 84 + review 8 → 92%`). 라벨이 답하는 질문은
 * "이 언어가 얼마나 채워졌나"이고, 검토 대기도 **값이 들어 있는 칸**이다 — 바가 그중 얼마가 아직
 * 검토 전인지를 amber로 말한다. 라벨을 `done`만으로 내면 검토를 기다리는 값이 화면에서 미번역과
 * 구별되지 않는다.
 */
export type RowLocaleProgress = {
  surfaceSlug: string;
  code: string;
  isBase: boolean;
  total: number;
  done: number;
  review: number;
  percent: number;
};

/** Meter 자리에 문장이 서는 갈래 넷 (DESIGN §6.63). */
export type MeterNote = "setup" | "waiting" | "importing" | "failed";

/**
 * 바를 그릴지 문장을 둘지.
 *
 * ⚠️ **0% 바를 금지하는 것이 계약이다.** 값이 없는 상태에서 빈 바를 그리면 "0% 번역됨"으로 읽히는데,
 * 그 프로젝트는 아직 셀 것이 없는 상태다.
 *
 * ⚠️ **이미 적재된 프로젝트의 실패는 바를 지우지 않는다** — 데이터가 있는데 문장으로 덮으면
 * "번역이 사라졌다"로 읽힌다. 그 사실은 띠가 말한다.
 */
export function meterSlot(
  row: RowInput,
  locales: readonly RowLocaleProgress[],
): { kind: "meters"; locales: readonly RowLocaleProgress[] } | { kind: "note"; note: MeterNote } {
  const status = projectStatus(row);
  if (status === "setup") return { kind: "note", note: "setup" };
  if (status === "awaiting_first_sync") {
    if (row.importing) return { kind: "note", note: "importing" };
    return { kind: "note", note: row.importError === null ? "waiting" : "failed" };
  }
  return { kind: "meters", locales };
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
 * 행의 Meter 재료 (DESIGN §6.63).
 *
 * ⚠️ **`localeProgress`(`lib/keys/view.ts`)와 합치지 않는다** — 저쪽은 `untranslated`·orphaned 꼬리까지
 * 드는 화면 계약이고 여기 필요한 것은 두 구간 비율뿐이다. **`percent`의 내림 규칙만 그대로 쓴다**
 * (902/903이 100%로 보이면 안 된다).
 *
 * ⚠️ **`slice(0, 3)`이 여기서 끝난다** — 폭 축소는 CSS가 하고(§6), 59로케일 리포에서 쓰이지 않을
 * 배열을 행마다 직렬화하면 RSC 페이로드에 그대로 실린다. Summary는 이 결과를 **쓰지 않는다**.
 */
export function rowLocaleProgress(
  locales: readonly LiveLocale[],
  keyTotals: ReadonlyMap<string, number>,
  cells: readonly LocaleCellCount[],
): Map<string, RowLocaleProgress[]> {
  const counted = foldCells(locales, cells);
  const byProject = new Map<string, RowLocaleProgress[]>();
  for (const locale of locales) {
    const total = keyTotals.get(locale.surfaceId) ?? 0;
    const cell = counted.get(cellKey(locale.projectId, locale.surfaceId, locale.code));
    const done = cell?.done ?? 0;
    const review = cell?.review ?? 0;
    const list = byProject.get(locale.projectId) ?? [];
    // 분모가 0이면 비율도 0이다 — 0으로 나누지 않는다.
    list.push({
      surfaceSlug: locale.surfaceSlug,
      code: locale.code,
      isBase: locale.isBase,
      total,
      done,
      review,
      // ⚠️ **내림이다** — 902/903이 100%로 보이면 안 된다 (`localeProgress`와 같은 규칙).
      percent: total === 0 ? 0 : Math.floor(((done + review) / total) * 100),
    });
    byProject.set(locale.projectId, list);
  }
  for (const [projectId, list] of byProject) {
    // base 먼저 → 코드순. 앞에서부터 자르므로 "하나만 남으면 base"가 공짜로 성립한다 (DESIGN §6.63).
    list.sort((a, b) => a.surfaceSlug < b.surfaceSlug ? -1 : a.surfaceSlug > b.surfaceSlug ? 1 : a.isBase === b.isBase ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) : a.isBase ? -1 : 1);
    byProject.set(projectId, list.slice(0, 3));
  }
  return byProject;
}

/**
 * 프로젝트별 **검토 대기 셀 수**. `rowLocaleProgress`와 같은 접기를 쓰므로 "살아 있는 로케일만"이라는
 * 규칙이 한 벌로 남는다 — 호출부가 그 필터를 손으로 다시 짜면 구분자까지 두 벌이 된다.
 */
export function rowReviewCounts(
  locales: readonly LiveLocale[],
  cells: readonly LocaleCellCount[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, cell] of foldCells(locales, cells)) {
    if (cell.review === 0) continue;
    const projectId = key.slice(0, key.indexOf("\u0000"));
    out.set(projectId, (out.get(projectId) ?? 0) + cell.review);
  }
  return out;
}

/**
 * 프로젝트별 검토 대기의 **로케일별 분해** (DESIGN §6.64 — 카드 보조 줄 `5 en, 3 ja`).
 *
 * ⚠️ **`rowReviewCounts`와 같은 `foldCells`를 쓴다** — "살아 있는 로케일만"이라는 규칙이 한 벌로
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
 * ⚠️ **Meter의 셋 제한을 적용하지 않는다** — 59로케일 리포에서 넷째 로케일부터의 미번역이 통째로
 * 사라진다 (`i18n-many-locales`가 그 실물이다). 그래서 `rowLocaleProgress`의 결과를 재사용하지 않고
 * 같은 입력에서 따로 센다.
 *
 * ⚠️ **보관은 네 값 모두에서 빠진다** (2026-09-13 사용자). 행·Meter·제목 총계·그룹 카운트는 남는다 —
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
export function groupProjects<T extends RowInput>(
  rows: readonly T[],
  q: string | undefined,
): { flat: true; rows: T[] } | { flat: false; groups: [ProjectGroup, T[]][] } {
  if ((q ?? "").trim() !== "") return { flat: true, rows: [...rows] };
  const buckets = new Map<ProjectGroup, T[]>();
  for (const row of rows) {
    const group = projectGroup(row);
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

export function listBody<T extends RowInput & { name: string }>(
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

/**
 * 검색 일치 구간을 가른다 (캔버스 `3a`).
 *
 * ⚠️ **이름만 대상이다** — `searchProjects`가 `row.name` 하나를 보므로, 리포 줄까지 칠하면 화면이
 * 실제보다 넓게 찾은 것처럼 말한다. 그리고 **같은 규칙으로 대소문자를 무시한다**: 찾은 행인데
 * 칠해진 자리가 없으면 "왜 이 행이 나왔나"에 답할 것이 화면에 없다.
 *
 * ⚠️ **빈 조각을 내지 않는다** — 렌더가 빈 `<span>`을 만들면 그 padding이 글자 사이를 벌린다.
 */
export function highlightName(name: string, q: string | undefined): { text: string; match: boolean }[] {
  const needle = (q ?? "").trim().toLowerCase();
  if (needle === "") return [{ text: name, match: false }];

  const parts: { text: string; match: boolean }[] = [];
  const haystack = name.toLowerCase();
  // İ → i̇처럼 길이가 늘어나는 변환의 오프셋을 원문에 대응시킨다. 검색 자체는 전체 소문자화
  // 결과를 써야 그리스어 끝 시그마처럼 문맥에 따라 바뀌는 글자도 searchProjects와 일치한다.
  const offsets: { start: number; end: number }[] = [];
  let original = 0;
  for (const char of name) {
    const end = original + char.length;
    for (let i = 0; i < char.toLowerCase().length; i += 1) offsets.push({ start: original, end });
    original = end;
  }
  let cursor = 0;
  let searchAt = 0;
  for (;;) {
    const at = haystack.indexOf(needle, searchAt);
    if (at === -1) break;
    searchAt = at + needle.length;
    const start = offsets[at]?.start;
    const end = offsets[searchAt - 1]?.end;
    if (start === undefined || end === undefined || end <= cursor) continue;
    if (start > cursor) parts.push({ text: name.slice(cursor, start), match: false });
    parts.push({ text: name.slice(Math.max(cursor, start), end), match: true });
    cursor = end;
  }
  if (cursor < name.length) parts.push({ text: name.slice(cursor), match: false });
  return parts;
}
