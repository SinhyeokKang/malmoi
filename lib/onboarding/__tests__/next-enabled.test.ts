import { describe, expect, it } from "vitest";

import { type NextState, nextEnabled } from "../next-enabled";

/**
 * design §4의 상태 표를 코드로 옮긴 것 (feature design §10). 껍데기가 [Next]를 그릴 때 부른다.
 *
 * ⚠️ **`lib/` 아래 잎이다** — `components/` 아래로 내리면 `"use client"` 그래프에 들어가고,
 * 그러면 `client-graph.test.ts`가 이 모듈에까지 "타입만 물어라"를 요구한다.
 */
const state = (over: Partial<NextState> = {}): NextState => ({
  sessionExpired: false,
  repoSelected: false,
  repoAccessDenied: false,
  repoListLoading: false,
  detecting: false,
  detectFailed: false,
  candidateSelected: false,
  manualEntry: false,
  manualMatched: false,
  name: "",
  slug: "",
  baseLocale: "",
  slugTaken: false,
  ...over,
});

describe("nextEnabled ① 리포와 브랜치", () => {
  it("리포가 선택되면 활성이다", () => {
    expect(nextEnabled(1, state({ repoSelected: true }))).toBe(true);
  });

  it("아무것도 안 골랐으면 비활성이다 — 예외 A·B·B′·C가 전부 이 자리다", () => {
    expect(nextEnabled(1, state())).toBe(false);
  });

  it("목록을 읽는 중이면 비활성이다", () => {
    expect(nextEnabled(1, state({ repoSelected: true, repoListLoading: true }))).toBe(false);
  });

  it("`checkRepoAccess`가 거부하면 비활성이다 — 다음 단계로 못 간다 (예외 C′)", () => {
    expect(nextEnabled(1, state({ repoSelected: true, repoAccessDenied: true }))).toBe(false);
  });

  it("브랜치 **목록** 조회만 실패한 것은 막지 않는다 — default branch가 이미 값이다 (예외 D)", () => {
    // 예외 D는 상태 필드가 아니라 `planBranchChoice`의 `fixed`로 드러난다 — 여기서 [Next]는 그대로다.
    expect(nextEnabled(1, state({ repoSelected: true }))).toBe(true);
  });
});

describe("nextEnabled ② 로케일 파일", () => {
  it("후보를 고르면 활성이다", () => {
    expect(nextEnabled(2, state({ candidateSelected: true }))).toBe(true);
  });

  it("탐지 중이면 비활성이다 — 먼저 넘어온 뒤 스켈레톤이 찬다", () => {
    expect(nextEnabled(2, state({ candidateSelected: true, detecting: true }))).toBe(false);
  });

  it("탐지가 실패하면 비활성이다 (예외 F)", () => {
    expect(nextEnabled(2, state({ candidateSelected: true, detectFailed: true }))).toBe(false);
  });

  it("수동 지정이면 매칭이 있을 때만 활성이다 — 거기서는 매칭이 곧 검증이다 (예외 E)", () => {
    expect(nextEnabled(2, state({ manualEntry: true }))).toBe(false);
    expect(nextEnabled(2, state({ manualEntry: true, manualMatched: true }))).toBe(true);
  });

  it("수동 지정으로 넘어가면 옛 후보 선택이 [Next]를 열어 주지 않는다", () => {
    expect(nextEnabled(2, state({ manualEntry: true, candidateSelected: true }))).toBe(false);
  });
});

describe("nextEnabled ③ 이름·주소·기준 언어", () => {
  const filled = { name: "Web", slug: "web", baseLocale: "en" };

  it("셋이 다 차면 활성이다", () => {
    expect(nextEnabled(3, state(filled))).toBe(true);
  });

  it("이름이 공백뿐이면 비활성이다", () => {
    expect(nextEnabled(3, state({ ...filled, name: "   " }))).toBe(false);
  });

  it("기준 언어가 없으면 비활성이다", () => {
    expect(nextEnabled(3, state({ ...filled, baseLocale: "" }))).toBe(false);
  });

  it("주소 형식이 `planSlug` 갈래에 걸리면 비활성이다 — 왕복 0으로 판정한다", () => {
    expect(nextEnabled(3, state({ ...filled, slug: "" }))).toBe(false);
    expect(nextEnabled(3, state({ ...filled, slug: "Web Site" }))).toBe(false);
    expect(nextEnabled(3, state({ ...filled, slug: "x".repeat(41) }))).toBe(false);
  });

  it("`new`는 예약이라 비활성이다 — 그 예약의 근거가 바로 이 라우트다", () => {
    expect(nextEnabled(3, state({ ...filled, slug: "new" }))).toBe(false);
  });

  it("제출이 `slug-taken`으로 돌아오면 비활성이다 — 사용자가 고쳐야 다시 열린다 (예외 G)", () => {
    expect(nextEnabled(3, state({ ...filled, slugTaken: true }))).toBe(false);
  });
});

describe("nextEnabled ④ 결과", () => {
  it("적재 중에도 활성이다 — 비활성이면 토큰을 이미 옮긴 사용자가 60초를 갇힌다", () => {
    expect(nextEnabled(4, state())).toBe(true);
  });
});

describe("nextEnabled — 예외 J 세션 만료", () => {
  it("어느 단계에서든 비활성이다 — 갈래마다 다시 만들지 않는다", () => {
    const expired = state({ sessionExpired: true, repoSelected: true, candidateSelected: true, name: "Web", slug: "web", baseLocale: "en" });

    expect([1, 2, 3, 4].map((step) => nextEnabled(step as 1 | 2 | 3 | 4, expired))).toEqual([false, false, false, false]);
  });
});
