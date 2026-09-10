import { planProjectReadiness } from "@/lib/onboarding/readiness";

/**
 * 프로젝트 목록의 순수 판정 (8-3).
 *
 * 필터는 URL에 산다(`?filter=`) — 클라이언트 상태가 아니라 서버가 이미 걸러 그린다. 그래야
 * 뒤로가기·공유·새로고침이 그냥 되고, `logs`의 `?cursor=`와 같은 관용구다.
 */

export const PROJECT_FILTERS = ["all", "active", "archived"] as const;

export type ProjectFilter = (typeof PROJECT_FILTERS)[number];

/**
 * 주소창 값 → 갈래. **모르는 값은 `all`이다** — 빈 화면을 주지 않는다.
 *
 * ⚠️ **객체 조회로 바꾸지 않는다.** 남이 정한 문자열이라 `constructor`·`__proto__`가 값으로
 * 찾아지는 부류이고, 이 리포는 그것을 두 번 밟았다 (POSTMORTEM 2026-09-08·09). 배열 `includes`는
 * 프로토타입 체인을 보지 않는다.
 */
export function parseProjectFilter(raw: string | undefined): ProjectFilter {
  return PROJECT_FILTERS.find((f) => f === raw) ?? "all";
}

/**
 * ⚠️ **원본을 건드리지 않는다** — 호출부가 같은 배열로 총계도 세므로, 제자리에서 잘라내면 제목 옆
 * 숫자가 탭에 따라 달라진다(총계는 필터 전의 값이어야 한다).
 */
export function filterProjects<T extends { archivedAt: Date | null }>(
  rows: readonly T[],
  filter: ProjectFilter,
): T[] {
  if (filter === "all") return [...rows];
  const archived = filter === "archived";
  return rows.filter((row) => (row.archivedAt !== null) === archived);
}

/**
 * 행 우측 배지의 갈래 (8-3 시안 개정).
 *
 * ⚠️ **`ready`가 침묵이 아니라 `Active`다.** DESIGN §6.1("가장 흔한 상태가 가장 조용하다")의 예외이고
 * 근거는 **필터 탭이 같은 낱말을 쓴다**는 것 — `All / Active / Archived`를 보고 있는 사람에게 행의
 * 배지가 그 축을 그대로 되비추면 "지금 무엇을 보고 있나"가 이어진다. 배지가 항상 하나라 행 우측
 * 폭도 흔들리지 않는다.
 *
 * ⚠️ **보관이 readiness보다 앞이다** — 멈춘 프로젝트에서 "첫 적재를 기다리는 중"은 답할 질문이
 * 아니다 (`planProjectAccess`가 권한 → 보관 순으로 보는 것과 같은 결).
 */
export type ProjectStatus = "active" | "archived" | "setup" | "awaiting_first_sync";

export function projectStatus(row: {
  archivedAt: Date | null;
  installationId: string | null;
  lastCommitSha: string | null;
}): ProjectStatus {
  if (row.archivedAt !== null) return "archived";
  const readiness = planProjectReadiness(row);
  return readiness === "ready" ? "active" : readiness;
}
