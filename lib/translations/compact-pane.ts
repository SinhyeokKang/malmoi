/**
 * 번역 단일 판의 **판 전환** (responsive-app design §3 전환 표 — 2026-10-07 사용자 확정). **잎이다** — DOM·서버·draft·폭을 모른다.
 *
 * 판(`list`·`detail`)은 한 Workspace가 들고, 표시는 CSS(`@container` + `data-pane`)가 정한다 — 이 값은 split에서도 저장된다(폭을 되돌리면 그 판이 선다).
 * ⚠️ **판 전환은 URL·history를 건드리지 않는다** — 이 모듈엔 그 입력이 없다. 브라우저 뒤로/앞으로는 기존 이동(`useLeaveGuard`)이 든다.
 * ⚠️ **키 값이 바뀌었다는 것만으로 상세가 되지 않는다** — 트리 이동의 첫 키(`@first`)는 목록에 남는다. 그 구분은 껍데기가 `cause`로 넘긴다.
 */
export type Pane = "list" | "detail";

export type PaneEvent =
  /** 상세 머리의 ‹ Keys. */
  | { type: "show-list" }
  /** 목록에서 같은 키 재열기 · 이탈 확인을 지난 다른 키 선택(다른 소스 포함). */
  | { type: "open-key" }
  /** 서버가 그린 선택 키가 바뀌었다 — `tree`는 이 화면이 승인한 트리 이동의 도착, `other`는 그 밖(검색·Inbox·뒤로가기·필터의 선택 해제). */
  | { type: "selection"; key: string | undefined; cause: "tree" | "other" }
  /** 상세 입력의 포커스·편집·IME 조합 시작 — split에서도 온다. */
  | { type: "detail-input" }
  /** 폭이 바뀌었다 — `detailActive`는 지금 상세 입력이 쓰이고 있다(포커스가 그 안). */
  | { type: "resize"; detailActive: boolean };

export function initialPane(input: { key: string | undefined; treeArrival: boolean }): Pane {
  return input.key !== undefined && !input.treeArrival ? "detail" : "list";
}

export function reducePane(pane: Pane, event: PaneEvent): Pane {
  switch (event.type) {
    case "show-list": return "list";
    case "open-key":
    case "detail-input": return "detail";
    case "selection": return event.cause === "tree" || event.key === undefined ? "list" : "detail";
    case "resize": return event.detailActive ? "detail" : pane;
    default: return event satisfies never;
  }
}

/**
 * **트리 이동 의도 — 클라이언트 모듈 변수 한 칸** (design §3 — 2026-10-07 사용자). 이탈 확인을 지난 트리·범위 이동만 쓴다(취소한 이동은 안 쓴다).
 * 같은 소스면 마운트된 화면의 다음 선택 변경이, 다른 소스면 다음 마운트가 읽고 비운다 — 새로고침·다른 탭에는 새지 않는다(sessionStorage가 아니다).
 * ⚠️ **만료된다** — 목적지가 Workspace를 그리지 않으면(오류 경계 등) 아무도 비우지 않는다. 재마운트 착지 표식(`workspace.tsx`의 `landing`)과 같은 값이다.
 */
export const TREE_INTENT_TTL_MS = 15_000;
let treeIntent: { surfaceSlug: string; at: number } | null = null;

export function issueTreeIntent(surfaceSlug: string, now: number): void {
  treeIntent = { surfaceSlug, at: now };
}

/** 마운트 렌더가 **읽기만** 한다 — 렌더에서 비우면 dev StrictMode의 두 번째 렌더가 빈 의도를 읽는다. 비우는 것은 effect(`clearTreeIntent`)다. */
export function peekTreeIntent(surfaceSlug: string, now: number): boolean {
  return treeIntent !== null && treeIntent.surfaceSlug === surfaceSlug && now - treeIntent.at <= TREE_INTENT_TTL_MS;
}

export function clearTreeIntent(): void {
  treeIntent = null;
}

/** 읽고 비운다 — 맞지 않아도 비운다(다른 이동이 대신했다). */
export function takeTreeIntent(surfaceSlug: string, now: number): boolean {
  const hit = peekTreeIntent(surfaceSlug, now);
  treeIntent = null;
  return hit;
}
