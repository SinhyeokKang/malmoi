import { describe, expect, it } from "vitest";

import { isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";

import { ingestHeadline, isOnboardError, onboardErrorMessage, type OnboardError } from "../message";

/**
 * 온보딩 실패 갈래 → 한국어 한 줄 (design §3.12). `connectErrorMessage`와 **같은 형**이다 — `satisfies never`로
 * 갈래 누락을 컴파일 타임에 막고, 모르는 값에는 던지지 않고 폴백한다(`?e=`는 주소창에 있다).
 *
 * ⚠️ **판정 union을 만드는 커밋과 문구를 만드는 커밋을 나누지 않는다.** "거부는 옳게 판정됐는데 화면에
 * 닿지 않아 버튼이 안 눌린 것으로 보였다"가 이 리포에서 두 번 밟은 지뢰다 (POSTMORTEM 2026-09-06).
 */

/** union 전체를 **값으로** 든다. 아래 타입 검사가 이 배열과 union의 크기를 맞춘다. */
const ERRORS = [
  // ①' 연결·설치
  "no-installations",
  "no-repos",
  // ③ 탐지
  "no-candidates",
  "tree-truncated",
  "base-branch-missing",
  "key-count-failed",
  "manual-no-match",
  // ④ 생성 — planRepoConnect 그대로
  "installation-forbidden",
  "repo-forbidden",
  "repo-not-installed",
  // ④ 생성 — 이쪽 고유
  "slug-taken",
  "limit-reached",
  "invalid-slug",
  // 다시 시도 · 첫 적재
  "not-awaiting",
  "ingest-failed",
  // 전부
  "unavailable",
  "unauthorized",
] as const satisfies readonly OnboardError[];

type Missing = Exclude<OnboardError, (typeof ERRORS)[number]>;
const _coversUnion: [Missing] extends [never] ? true : false = true;
void _coversUnion;

describe("isOnboardError — union과 판정 Set이 갈리지 않는다", () => {
  it("union의 모든 값이 통과한다 — 하나라도 빠지면 그 사유는 화면에서 무음이다", () => {
    for (const error of ERRORS) expect(isOnboardError(error)).toBe(true);
  });

  it("모르는 문자열·비문자열은 거른다", () => {
    for (const value of ["", "nope", "slug_taken", "OK", 1, null, undefined, {}, []]) {
      expect(isOnboardError(value)).toBe(false);
    }
  });
});

describe("onboardErrorMessage — 갈래마다 다른 한국어 문구", () => {
  it("열일곱 사유가 각자 다른 문장을 낸다", () => {
    expect(new Set(ERRORS.map(onboardErrorMessage)).size).toBe(ERRORS.length);
  });

  it("빈 문구를 내지 않고 영어 토큰을 그대로 흘리지 않는다 — 읽는 사람은 비개발자 동료다", () => {
    for (const error of ERRORS) {
      const text = onboardErrorMessage(error);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toContain(error);
    }
  });

  it("모르는 값에 던지지 않고 폴백한다 — `?e=`는 사용자가 손댈 수 있다", () => {
    expect(onboardErrorMessage("무엇이든" as OnboardError).trim().length).toBeGreaterThan(0);
  });

  it("`planRepoConnect` 셋은 `connectErrorMessage`를 그대로 쓴다 — 같은 거부에 문구가 두 벌이면 안 된다", () => {
    for (const error of ["installation-forbidden", "repo-forbidden", "repo-not-installed"] as const) {
      expect(onboardErrorMessage(error)).toBe(connectErrorMessage(error));
    }
  });

  it("`unavailable`만 '잠시'를 권한다 — 고정된 거부에 재시도를 권하면 같은 버튼을 반복해서 누른다", () => {
    expect(onboardErrorMessage("unavailable")).toContain("잠시");
    for (const error of ERRORS.filter((e) => e !== "unavailable")) {
      expect(onboardErrorMessage(error)).not.toContain("잠시");
    }
  });

  it("`unauthorized`는 '입력한 값은 그대로'라고 말하지 않는다 — 중간 상태 무저장이라 거짓이다 (design §3.4)", () => {
    expect(onboardErrorMessage("unauthorized")).not.toContain("그대로");
  });

  it("`no-candidates`는 이유(언어 2개 이상)를 말한다 — 수동 지정으로 가는 근거다", () => {
    expect(onboardErrorMessage("no-candidates")).toContain("2개");
  });

  it("`limit-reached`는 개수를 말한다", () => {
    expect(onboardErrorMessage("limit-reached")).toContain("3개");
  });
});

describe("ingestHeadline — 불변식 9: 0건이 아니면 성공 문구를 그대로 쓰지 않는다", () => {
  it("실패 0이면 성공 문구다", () => {
    const text = ingestHeadline(12, 0);
    expect(text).toContain("12");
    expect(text).toContain("적재했어요");
    expect(text).not.toContain("읽지 못했어요");
  });

  it("실패가 있으면 '읽지 못했어요'가 들어가고 두 숫자가 다 보인다", () => {
    const text = ingestHeadline(12, 3);
    expect(text).toContain("12");
    expect(text).toContain("3");
    expect(text).toContain("읽지 못했어요");
  });

  it("두 문구는 서로 다르다", () => {
    expect(ingestHeadline(5, 0)).not.toBe(ingestHeadline(5, 1));
  });
});

describe("다른 union과 겹치는 값", () => {
  it("`unavailable`·`unauthorized`는 AccessError에도 있다 — `/projects/new`의 판정 순서가 의도된 것임을 고정한다", () => {
    expect(isAccessError("unavailable")).toBe(true);
    expect(isAccessError("unauthorized")).toBe(true);
    expect(isOnboardError("unavailable")).toBe(true);
    expect(isOnboardError("unauthorized")).toBe(true);
  });

  it("ConnectError와 겹치는 것은 넷이고, 나머지는 `isConnectError`가 걸러내지 못한다 — 그래서 `/projects/new`가 둘을 다 읽는다", () => {
    const overlap = ERRORS.filter((e) => isConnectError(e));
    expect(overlap.slice().sort()).toEqual(["installation-forbidden", "repo-forbidden", "repo-not-installed", "unavailable"]);
  });
});
