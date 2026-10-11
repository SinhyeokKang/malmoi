import { afterEach, describe, expect, it } from "vitest";

import { clearTreeIntent, initialPane, issueTreeIntent, peekTreeIntent, reducePane, takeTreeIntent, TREE_INTENT_TTL_MS, type Pane, type PaneEvent } from "../compact-pane";

/**
 * 번역 단일 판의 판 전환 (responsive-app design §3 전환 표 — 2026-10-07 사용자 확정). reducer는 **판만** 낸다 — 폭·서버 I/O·draft·history를 모른다.
 * 판 전환은 URL·history를 바꾸지 않는다: 이 모듈에 그 입력 자체가 없다(아래 "history" 사례가 출력 형을 센다).
 */
const run = (start: Pane, events: PaneEvent[]) => events.reduce(reducePane, start);

describe("initialPane — 첫 진입", () => {
  it("key 없는 직접 진입은 목록이다", () => {
    expect(initialPane({ key: undefined, treeArrival: false })).toBe("list");
  });
  it("key 있는 직접 URL·검색·Inbox 진입은 상세다", () => {
    expect(initialPane({ key: "k1", treeArrival: false })).toBe("detail");
  });
  it("승인된 트리 이동의 재마운트 도착은 첫 키가 있어도 목록이다", () => {
    expect(initialPane({ key: "k1", treeArrival: true })).toBe("list");
  });
});

describe("reducePane — 전환 표", () => {
  it("목록에서 같은 키를 다시 열면 상세다 — navigation의 stay가 판 전환을 막지 않는다", () => {
    expect(run("detail", [{ type: "show-list" }, { type: "open-key" }])).toBe("detail");
  });
  it("'목록으로'는 목록이다", () => {
    expect(reducePane("detail", { type: "show-list" })).toBe("list");
  });
  it("승인된 다른 키 선택(다른 소스 포함)은 상세다", () => {
    expect(reducePane("list", { type: "open-key" })).toBe("detail");
  });
  it("URL의 선택 키가 밖에서 바뀌면(검색·Inbox·뒤로가기) 상세, 선택이 사라지면 목록이다", () => {
    expect(reducePane("list", { type: "selection", key: "k2", cause: "other" })).toBe("detail");
    expect(reducePane("detail", { type: "selection", key: undefined, cause: "other" })).toBe("list");
  });
  it("트리 이동의 도착은 첫 키가 골라져도 목록이다 — 키 값 변경만으로 상세가 되지 않는다", () => {
    expect(reducePane("list", { type: "selection", key: "k1", cause: "tree" })).toBe("list");
    expect(reducePane("detail", { type: "selection", key: "k1", cause: "tree" })).toBe("list");
  });
  it("트리 도착 뒤 검색·Inbox로 키를 열면 상세다 — 늦은 트리 응답이 앞서 소비됐다", () => {
    expect(run("list", [{ type: "selection", key: "k1", cause: "tree" }, { type: "selection", key: "k9", cause: "other" }])).toBe("detail");
  });
  it("split에서 상세 입력이 활성화되면 저장된 판이 상세가 된다 — 목록 복귀 → split → 입력 → single에서 상세 유지", () => {
    expect(run("detail", [{ type: "show-list" }, { type: "detail-input" }, { type: "resize", detailActive: true }])).toBe("detail");
  });
  it("상세를 쓰지 않은 폭 왕복은 목록을 유지한다", () => {
    expect(run("list", [{ type: "resize", detailActive: false }, { type: "resize", detailActive: false }])).toBe("list");
  });
  it("resize는 입력 중인 상세를 저장된 판보다 앞세운다 — 그 밖엔 현 판 그대로", () => {
    expect(reducePane("list", { type: "resize", detailActive: true })).toBe("detail");
    expect(reducePane("detail", { type: "resize", detailActive: false })).toBe("detail");
  });
  it("출력은 판 하나뿐이다 — URL·history를 만들 입력·출력이 없다(history entry 0)", () => {
    const next = reducePane("list", { type: "open-key" });
    expect(typeof next).toBe("string");
  });
});

describe("트리 이동 의도 — 클라이언트 모듈 변수 1회성", () => {
  afterEach(() => clearTreeIntent());
  const now = 1_000_000;

  it("같은 소스의 다음 도착이 한 번 읽는다 — 두 번째는 못 읽는다", () => {
    issueTreeIntent("web", now);
    expect(takeTreeIntent("web", now + 10)).toBe(true);
    expect(takeTreeIntent("web", now + 20)).toBe(false);
  });
  it("다음 마운트는 엿보고(peek) 지우는 것은 따로다 — StrictMode 이중 렌더가 빈 의도를 읽지 않게", () => {
    issueTreeIntent("app", now);
    expect(peekTreeIntent("app", now + 5)).toBe(true);
    expect(peekTreeIntent("app", now + 6)).toBe(true);
    clearTreeIntent();
    expect(peekTreeIntent("app", now + 7)).toBe(false);
  });
  it("다른 소스의 마운트는 읽지 못하고 의도를 버린다 — 새로고침·다른 탭에 새지 않는다", () => {
    issueTreeIntent("app", now);
    expect(takeTreeIntent("web", now)).toBe(false);
    expect(takeTreeIntent("app", now)).toBe(false);
  });
  it("만료된 의도는 읽지 못한다 — 목적지가 워크스페이스를 그리지 않은 이동", () => {
    issueTreeIntent("web", now);
    expect(takeTreeIntent("web", now + TREE_INTENT_TTL_MS + 1)).toBe(false);
  });
  it("새 이동이 앞 의도를 대신한다", () => {
    issueTreeIntent("web", now);
    issueTreeIntent("app", now + 1);
    expect(takeTreeIntent("web", now + 2)).toBe(false);
  });
});
