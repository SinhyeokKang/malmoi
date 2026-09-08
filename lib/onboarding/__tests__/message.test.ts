import { describe, expect, it } from "vitest";

import { isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";

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
  // 번역 Action — 첫 적재 전
  "not-ready",
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

describe("onboardErrorMessage — 갈래마다 다른 문구", () => {
  it("열여덟 사유가 각자 다른 문장을 낸다", () => {
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
    expect(onboardErrorMessage("unavailable")).toMatch(/in a moment/i);
    for (const error of ERRORS.filter((e) => e !== "unavailable")) {
      expect(onboardErrorMessage(error)).not.toMatch(/in a moment/i);
    }
  });

  it("`unauthorized`는 '입력한 값은 그대로'라고 말하지 않는다 — 중간 상태 무저장이라 거짓이다 (design §3.4)", () => {
    expect(onboardErrorMessage("unauthorized")).not.toMatch(/is kept|are kept/i);
  });

  it("`no-candidates`는 이유(언어 2개 이상)를 말한다 — 수동 지정으로 가는 근거다", () => {
    expect(onboardErrorMessage("no-candidates")).toMatch(/2 or more/i);
  });

  /**
   * ⚠️ **`tree-truncated`는 수동 지정을 해결책으로 권하지 않는다** (2026-09-07 리뷰 🟡3). 전 문구는
   * "아래에서 경로를 직접 지정해 주세요"였는데 둘 다 거짓이었다: ① 탐지 실패면 화면이 리포 선택
   * 단계에 남아 그 "아래"가 존재하지 않고 ② 확정의 재검증이 **같은 잘린 스냅샷**을 읽어 같은 갈래를
   * 다시 낸다. 없는 길로 안내하는 것이 사유를 숨기는 것보다 나쁘다.
   */
  it("`tree-truncated`는 없는 길로 안내하지 않는다 — 수동 지정도 같은 스냅샷에서 막힌다", () => {
    const text = onboardErrorMessage("tree-truncated");
    // 왜 막히는지를 말한다 — 사용자가 수동 지정을 시도하고 같은 벽을 만나지 않게 한다.
    expect(text).toMatch(/same limit/i);
  });

  it("`limit-reached`는 개수를 말한다", () => {
    expect(onboardErrorMessage("limit-reached")).toMatch(/\b3\b/);
  });

  it("`not-ready`는 번역자에게 무엇을 기다리는지 말한다 — 내부 이름을 쓰지 않는다", () => {
    // 이 문구는 **번역 화면의 저장 실패 줄**에 뜬다 (design §3.7). "not-ready"를 그대로 흘리면
    // 비개발자 동료는 무슨 일이 일어났는지 알 수 없다 (POSTMORTEM 2026-09-06).
    const text = onboardErrorMessage("not-ready");
    expect(text).toMatch(/setting it up/i);
    // 흘리면 안 되는 것은 **내부 토큰**이다 — en 문장의 "ready"라는 낱말이 아니다.
    expect(text).not.toContain("not-ready");
  });
});

describe("ingestHeadline — 불변식 9: 0건이 아니면 성공 문구를 그대로 쓰지 않는다", () => {
  it("실패 0이면 성공 문구다", () => {
    const text = ingestHeadline(12, 0);
    expect(text).toContain("12");
    expect(text).toMatch(/^Imported/);
    expect(text).not.toMatch(/couldn't be read/i);
  });

  it("실패가 있으면 못 읽었다는 말이 들어가고 두 숫자가 다 보인다", () => {
    const text = ingestHeadline(12, 3);
    expect(text).toContain("12");
    expect(text).toContain("3");
    expect(text).toMatch(/couldn't be read/i);
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

/**
 * ⚠️ **`satisfies`는 잉여 키를 못 잡는다** (2026-09-08 code-review ⚪9). `m.errors.x satisfies
 * Record<Union, string>`은 **없는 키**를 컴파일 에러로 만들지만, union에서 갈래를 지웠을 때 사전에 남는
 * **죽은 문구**에는 침묵한다(신선한 객체 리터럴이 아니라 excess property check가 안 걸린다).
 * 그래서 반대 방향은 런타임으로 센다.
 */
describe("사전에 죽은 문구가 남지 않는다", () => {
  it("errors.onboarding의 키가 전부 OnboardError다 (fallback 제외)", () => {
    for (const key of Object.keys(m.errors.onboarding)) {
      if (key === "fallback") continue;
      expect(isOnboardError(key), key).toBe(true);
    }
  });
});
