import { describe, expect, it } from "vitest";

import { planHomeState } from "../state";

/**
 * Home의 여섯 화면(캔버스 `2a`~`2e`)이 **한 함수의 반환값 하나로** 갈린다 (project-home design §4).
 *
 * ⚠️ **로딩은 이 함수의 갈래가 아니다.** 여섯 번째 아트보드 `2e`는 데이터 상태가 아니라 **라우트의
 * `loading.tsx`**이고, 그것을 union에 넣으면 생산자가 없는 갈래가 하나 남는다(이 리포가 금지한다 —
 * `listBody`의 `flat` 주석). 그래서 값은 다섯이고 `2e`는 화면이 기존 관용구로 그린다.
 *
 * ⚠️ **순서가 곧 우선순위다.** 상태 둘이 동시에 참인 조합이 실제로 존재하고(보관된 프로젝트의 App이
 * 제거됐다 등), 그때 무엇을 그릴지가 JSX의 `&&` 순서로 정해지면 화면을 읽어야만 알 수 있다.
 */

const ok = { status: "ok" } as const;
const zero = { newFromGithub: 0, toTranslate: 0, toReview: 0, toSend: 0 };
const some = { newFromGithub: 0, toTranslate: 4, toReview: 0, toSend: 0 };
const base = { archived: false, connection: ok, surfaces: [], counts: some };

describe("planHomeState — 우선순위가 곧 순서다", () => {
  it("아무 일도 없으면 기본이다", () => {
    expect(planHomeState(base)).toBe("default");
  });

  /** 네 값이 전부 0일 때만이다 — 한 칸이라도 서 있으면 할 일이 있는 화면이다. */
  it("카드 넷이 전부 0이면 빈 상태다", () => {
    expect(planHomeState({ ...base, counts: zero })).toBe("empty");
    expect(planHomeState({ ...base, counts: { ...zero, toSend: 1 } })).toBe("default");
    expect(planHomeState({ ...base, counts: { ...zero, newFromGithub: 1 } })).toBe("default");
  });

  it("임포트가 실패한 표면이 있으면 Sync 실패다", () => {
    expect(planHomeState({ ...base, surfaces: [{ importError: "parse-failed", importing: false }] })).toBe("import_failed");
  });

  /**
   * ⚠️ **`failing`을 그대로 쓴다** — "지금 돌고 있다"가 "지난번에 실패했다"를 이긴다. 판정이 두 벌이
   * 되면 목록은 Importing, Home은 빨간 배너가 되어 같은 두 컬럼에서 정반대 사실을 말한다.
   */
  it("다시 돌고 있는 중이면 남은 코드는 이전 실행의 것이라 실패가 아니다", () => {
    expect(planHomeState({ ...base, surfaces: [{ importError: "parse-failed", importing: true }] })).toBe("default");
  });

  it("표면 여럿 중 하나만 실패해도 실패다 — 나머지는 들어왔다", () => {
    expect(planHomeState({ ...base, surfaces: [
      { importError: null, importing: false },
      { importError: "invalid-format", importing: false },
    ] })).toBe("import_failed");
  });

  it("미연결이 임포트 실패를 이긴다 — 그 밑의 사건은 전부 손댈 수 없다", () => {
    expect(planHomeState({
      ...base,
      connection: { status: "app-uninstalled" },
      surfaces: [{ importError: "parse-failed", importing: false }],
    })).toBe("not_connected");
  });

  it("보관이 미연결을 이긴다 — 멈춘 프로젝트에 연결은 답할 질문이 아니다", () => {
    expect(planHomeState({ ...base, archived: true, connection: { status: "app-uninstalled" } })).toBe("archived");
  });

  it("보관은 빈 상태도 이긴다", () => {
    expect(planHomeState({ ...base, archived: true, counts: zero })).toBe("archived");
  });

  /**
   * ⚠️ **조회 실패(`unknown`)를 미연결로 접지 않는다.** 접으면 GitHub 장애가 "App이 제거됐다"로
   * 읽히고 사용자가 재설치하러 간다 — `planConnectionHealth`가 `error`를 `app-uninstalled`로 접지
   * 않는 것과 같은 축이다 (POSTMORTEM 2026-09-03·09-06).
   */
  it("연결 상태를 모르면 배너를 세우지 않는다", () => {
    expect(planHomeState({ ...base, connection: { status: "unknown" } })).toBe("default");
  });

  /**
   * ⚠️ **주소가 바뀐 것과 끊긴 것은 다르다.** `repo-moved`·`installation-changed`는 Sync·Publish가
   * 여전히 도는 상태라 "일시 정지"라고 말하면 거짓이다 — 그 안내는 설정 화면이 든다.
   */
  it("주소·설치가 바뀐 것만으로는 일시 정지가 아니다", () => {
    expect(planHomeState({ ...base, connection: { status: "repo-moved", fullName: "o/new" } })).toBe("default");
    expect(planHomeState({ ...base, connection: { status: "installation-changed", installationId: "2" } })).toBe("default");
  });

  it("연결 전·제거·다른 리포 셋은 전부 미연결이다 — Sync도 Publish도 멈춘다", () => {
    for (const status of ["not-connected", "app-uninstalled", "repo-replaced"] as const) {
      expect(planHomeState({ ...base, connection: { status } })).toBe("not_connected");
    }
  });
});
