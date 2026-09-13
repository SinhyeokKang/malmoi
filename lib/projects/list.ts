import { planProjectReadiness } from "@/lib/onboarding/readiness";

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
  lastCommitSha: string | null;
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
