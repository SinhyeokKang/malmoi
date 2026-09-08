import { describe, expect, it } from "vitest";

import { planProjectReadiness, readinessLabel, type ProjectReadiness } from "../readiness";

/**
 * `ready` 판정 — 컬럼을 만들지 않고 기존 두 컬럼으로 판정한다 (design §3.7).
 *
 * ⚠️ **`lastCommitSha`가 "첫 적재가 성공했다"의 유일한 증거다.** `applyPush`가 키·번역과 한 트랜잭션에서
 * 그 컬럼을 쓰므로 부분 성공 상태가 없다. 설정(어댑터·경로·기준 로케일)이 저장됐다는 것은 `ready`가
 * 아니다 — SAAS 불변식 8.
 */

describe("planProjectReadiness", () => {
  it("installationId가 null이면 `setup`이다 — 연결 전. skillflo-web이 여기다", () => {
    expect(planProjectReadiness({ installationId: null, lastCommitSha: null })).toBe("setup");
  });

  it("installationId가 null이면 lastCommitSha가 있어도 `setup`이다 — 더미 SHA가 준비 상태를 만들지 않는다", () => {
    expect(planProjectReadiness({ installationId: null, lastCommitSha: "deadbeef" })).toBe("setup");
  });

  it("연결됐는데 lastCommitSha가 null이면 `awaiting_first_sync`다", () => {
    expect(planProjectReadiness({ installationId: "123", lastCommitSha: null })).toBe("awaiting_first_sync");
  });

  it("설정만 저장된 프로젝트는 `ready`가 아니다 (불변식 8) — 어댑터·경로가 있어도 적재 증거가 없다", () => {
    // Project 행 모양 — 판정 함수는 두 컬럼만 보지만, 행 전체를 넘겨도 된다는 것을 고정한다.
    const configured = {
      installationId: "123",
      lastCommitSha: null,
      adapterName: "json-catalog",
      pathTemplate: "src/locales/{locale}.json",
      baseLocale: "en",
    };
    expect(planProjectReadiness(configured)).toBe("awaiting_first_sync");
  });

  it("lastCommitSha가 있어야만 `ready`다", () => {
    expect(planProjectReadiness({ installationId: "123", lastCommitSha: "abc123" })).toBe("ready");
  });
});

/**
 * 목록 화면의 상태 텍스트 (design §3.7). **번역자도 보는 목록이므로 내부 이름을 쓰지 않는다** —
 * `awaiting_first_sync`가 화면에 뜨면 비개발자 동료는 무슨 일인지 알 수 없다.
 *
 * ⚠️ **`ready`는 표시가 없다** — 가장 흔한 상태가 가장 조용해야 한다 (DESIGN §6.1·§6.2의 "번역됨"·
 * "연결됨"과 같은 원리). 그래서 반환이 `string | null`이고, 화면이 null을 렌더하지 않는다.
 */
describe("readinessLabel — raw 색 없이 텍스트만 (DESIGN §6.2)", () => {
  const ALL = ["setup", "awaiting_first_sync", "ready"] as const satisfies readonly ProjectReadiness[];

  type Missing = Exclude<ProjectReadiness, (typeof ALL)[number]>;
  const _coversUnion: [Missing] extends [never] ? true : false = true;
  void _coversUnion;

  it("ready는 표시가 없다 — 가장 흔한 상태가 가장 조용하다", () => {
    expect(readinessLabel("ready")).toBeNull();
  });

  it("첫 적재를 기다리는 중이면 그 사실을 말한다", () => {
    expect(readinessLabel("awaiting_first_sync")).toBe("Waiting for first import");
  });

  it("연결 전이면 준비 중이다", () => {
    expect(readinessLabel("setup")).toBe("Setting up");
  });

  it("내부 이름을 흘리지 않는다 — 읽는 사람은 비개발자 동료다", () => {
    for (const readiness of ALL) {
      const label = readinessLabel(readiness);
      if (label === null) continue;
      expect(label).not.toContain(readiness);
      // snake_case는 우리 내부 이름의 모양이다 — en 라벨의 보통 낱말과 갈린다.
      expect(label).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });

  it("두 표시가 서로 다르다 — 한 문구로 접히면 상태를 구별할 수 없다", () => {
    expect(readinessLabel("setup")).not.toBe(readinessLabel("awaiting_first_sync"));
  });
});
