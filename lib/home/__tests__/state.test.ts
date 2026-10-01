import { describe, expect, it } from "vitest";

import { connectionProblem, failureState, homeBannerState, planActionAvailability, planHomeState } from "../state";

/**
 * Home의 여섯 화면(캔버스 `2a`~`2e`)이 **한 함수의 반환값 하나로** 갈린다 (DESIGN §6.64).
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
      { importError: "parse-crashed", importing: false },
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
   * ⚠️ **주소가 바뀐 것과 끊긴 것은 다르다.** `repo-moved`는 저장된 설치로 새 주소에 여전히 닿아
   * Sync·Publish가 도는 상태라 "일시 정지"라고 말하면 거짓이다 — 그 안내는 설정 화면이 든다.
   */
  it("주소가 바뀐 것만으로는 일시 정지가 아니다", () => {
    expect(planHomeState({ ...base, connection: { status: "repo-moved", fullName: "o/new" } })).toBe("default");
  });

  it("연결 전·제거·다른 리포 셋은 전부 미연결이다 — Sync도 Publish도 멈춘다", () => {
    for (const status of ["not-connected", "app-uninstalled", "repo-replaced"] as const) {
      expect(planHomeState({ ...base, connection: { status } })).toBe("not_connected");
    }
  });

  /**
   * ⚠️ **설치가 바뀌면 멈춘다** (#52 — 2026-09-17 실측). `createGitClient`는 **저장된**
   * `installationId`로 토큰을 받으므로, 재설치로 그 설치가 사라지면 모든 읽기·쓰기가 404다. 한때
   * 이 테스트는 반대를 고정했고 Home이 "Nothing needs you" + 켜진 Publish를 띄웠다 — 누르면
   * "Couldn't read what would go out"만 반복되고 [Reconnect]로 가는 길이 없었다.
   */
  it("설치가 바뀐 것은 미연결이다 — 저장된 설치로는 아무것도 못 한다", () => {
    expect(planHomeState({ ...base, connection: { status: "installation-changed", installationId: "2" } })).toBe("not_connected");
    expect(planHomeState({ ...base, counts: zero, connection: { status: "installation-changed", installationId: "2" } })).toBe("not_connected");
  });

  it("리포 id가 고정되지 않은 것도 미연결이다 — 목록이 Disconnected로 말한다(ux-drift-unify D1)", () => {
    expect(planHomeState({ ...base, connection: { status: "unpinned" } })).toBe("not_connected");
    expect(planHomeState({ ...base, archived: true, connection: { status: "unpinned" } })).toBe("archived");
  });
});

/** 연결 문제의 갈래 (2026-09-30 상태 통일) — 미연결 회색 · 끊김 호박 · 다른 리포 빨강. 설정 카드와 Home이 같은 판정을 쓴다. */
describe("connectionProblem", () => {
  it.each([
    ["not-connected", "not-connected"],
    ["app-uninstalled", "disconnected"],
    ["installation-changed", "disconnected"],
    // 설치는 있고 리포 id가 없다 — 목록의 Disconnected와 같은 결론(ux-drift-unify D1).
    ["unpinned", "disconnected"],
    ["repo-replaced", "wrong-repository"],
    ["ok", null],
    ["repo-moved", null],
    ["unknown", null],
  ] as const)("%s → %s", (status, problem) => {
    expect(connectionProblem(status)).toBe(problem);
  });
});

/**
 * **Publish·Sync를 켤 수 있나** (ux-drift-unify §3.3 · 🔴 F). Home과 번역 화면이 같은 함수를 부른다 — 번역 화면은 끊김에도 둘을 켜 두어
 * #52의 재발 경로였다. ⚠️ **모름(`unknown`)은 끄지 않는다** — 조회 실패를 끊김으로 접으면 GitHub 장애가 작업 중단이 된다(서버가 어차피 다시 판정한다).
 */
describe("planActionAvailability", () => {
  const OFF = { publish: false, sync: false };
  const ON = { publish: true, sync: true };
  it.each([
    ["not-connected"], ["unpinned"], ["app-uninstalled"], ["installation-changed"], ["repo-replaced"],
  ] as const)("끊김 %s → 둘 다 꺼짐", (status) => {
    expect(planActionAvailability({ archived: false, connection: status })).toEqual(OFF);
  });

  it.each([["ok"], ["repo-moved"], ["unknown"]] as const)("%s → 둘 다 켜짐", (status) => {
    expect(planActionAvailability({ archived: false, connection: status })).toEqual(ON);
  });

  it("보관이면 연결과 무관하게 꺼짐", () => {
    expect(planActionAvailability({ archived: true, connection: "ok" })).toEqual(OFF);
    expect(planActionAvailability({ archived: true, connection: "unpinned" })).toEqual(OFF);
    expect(planActionAvailability({ archived: true, connection: "unknown" })).toEqual(OFF);
  });

  it("Home 상태와 같은 결론이다 — 꺼지는 조합이 곧 archived·not_connected다", () => {
    const statuses = ["not-connected", "unpinned", "app-uninstalled", "installation-changed", "repo-replaced", "ok", "repo-moved", "unknown"] as const;
    for (const archived of [false, true]) {
      for (const status of statuses) {
        const connection = status === "installation-changed" ? { status, installationId: "2" } : status === "repo-moved" ? { status, fullName: "a/b" } : { status };
        const state = planHomeState({ ...base, archived, connection });
        expect(planActionAvailability({ archived, connection: status }).sync).toBe(state !== "archived" && state !== "not_connected");
      }
    }
  });
});

/**
 * **Home 배너의 상태 키** (ux-drift-unify T18) — `HomeNotices`가 이 키로 배너를 고른다. 교차 테스트가 이 함수를 불러 목록 칩·Settings 배지와 대조한다.
 * ⚠️ 일부 반영은 실패가 아니다(🔴 A2) — 같은 `import_failed` 상태에서도 코드가 톤을 가른다.
 */
describe("homeBannerState", () => {
  it.each([
    [{ state: "archived", problem: "disconnected", failure: "import-failed" }, "archived"],
    [{ state: "not_connected", problem: "not-connected", failure: null }, "notConnected"],
    [{ state: "not_connected", problem: "disconnected", failure: null }, "disconnected"],
    [{ state: "not_connected", problem: "wrong-repository", failure: null }, "wrongRepository"],
    [{ state: "import_failed", problem: null, failure: "import-failed" }, "syncFailed"],
    [{ state: "import_failed", problem: null, failure: "partial-import" }, "partiallySynced"],
    [{ state: "import_failed", problem: null, failure: null }, null],
    [{ state: "default", problem: null, failure: null }, null],
    [{ state: "empty", problem: null, failure: null }, null],
  ] as const)("%o → %s", (input, expected) => {
    expect(homeBannerState(input)).toBe(expected);
  });

  it("실패 코드 전부가 둘 중 하나로 간다 — 일부 반영만 partiallySynced다", () => {
    expect(failureState("partial-import")).toBe("partiallySynced");
    expect(failureState("parse-failed")).toBe("syncFailed");
  });
});
