import { describe, expect, it } from "vitest";

import { planProjectReadiness } from "../readiness";

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
