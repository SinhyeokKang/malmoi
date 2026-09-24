import { describe, expect, it } from "vitest";

import { isAccessError } from "@/lib/auth/message";

import { m } from "@/lib/i18n";

import { connectErrorMessage, isConnectError, type ConnectError } from "../message";

/**
 * 연결 실패 사유 → 사용자 문구 (ARCHITECTURE §6.3). `inviteErrorMessage`와 **같은 형**이다:
 * `satisfies never`로 갈래 누락을 컴파일 타임에 막고, 모르는 값에는 **던지지 않고 폴백**한다.
 *
 * ⚠️ **던지지 않는 것이 중요하다.** `?e=`는 주소창에 있어 사용자가 손댈 수 있다 — 던지면 설정 화면이
 * 통째로 죽는다. `accessErrorMessage`가 던져도 되는 것과 다르다(그쪽 인자는 우리 코드가 만든 값만
 * 들어온다).
 *
 * ⚠️ **이 파일이 방어선인 이유**: 판정은 옳게 났는데 화면에 닿지 않아 "버튼이 안 눌린 것으로 보인" 것이
 * 이 리포에서 두 번 밟은 지뢰다 (POSTMORTEM 2026-09-06). `entry-points.test.ts`의 "쿼리 파라미터 수신자"
 * 검사는 **대상 페이지가 `searchParams`를 읽는지만** 보므로 `/projects`는 이미 읽고 있어 그 회귀를
 * green으로 통과시킨다 — union 전수는 여기서만 잡힌다.
 */

/** union 전체를 **값으로** 든다. 아래 타입 검사가 이 배열과 union의 크기를 맞춘다. */
const ERRORS = [
  // callback 쪽
  "state-mismatch",
  "state-expired",
  "wrong-user",
  "denied",
  "exchange-failed",
  "taken-by-other",
  // Server Action 쪽
  "not-connected",
  "reauthorize",
  "repo-not-installed",
  "installation-forbidden",
  "repo-forbidden",
  // 양쪽 공통
  "unavailable",
] as const satisfies readonly ConnectError[];

/**
 * ⚠️ 위 배열이 union을 전부 덮는지 **컴파일 타임에** 검사한다. `lib/auth/message.ts`가 "`satisfies`
 * 검사로 union과 목록이 같은 크기임을 강제하지는 못한다"고 남긴 구멍을 여기서 닫는다.
 * `[T] extends [never]`로 감싸는 것은 naked `never`가 조건부 타입에서 분배되어 `never`가 되는 것을
 * 막기 위해서다.
 */
type Missing = Exclude<ConnectError, (typeof ERRORS)[number]>;
const _coversUnion: [Missing] extends [never] ? true : false = true;
void _coversUnion;

describe("isConnectError — union과 판정 Set이 갈리지 않는다", () => {
  it("union의 모든 값이 통과한다 — 하나라도 빠지면 그 사유는 화면에서 무음이 된다", () => {
    for (const error of ERRORS) {
      expect(isConnectError(error)).toBe(true);
    }
  });

  it("모르는 문자열·비문자열은 거른다 — 주소창 값이라 임의 입력이 들어온다", () => {
    for (const value of ["", "nope", "OK", "state_mismatch", 1, null, undefined, {}, []]) {
      expect(isConnectError(value)).toBe(false);
    }
  });
});

describe("connectErrorMessage — 갈래마다 다른 한국어 문구", () => {
  it("열두 사유가 각자 다른 문장을 낸다", () => {
    expect(new Set(ERRORS.map(connectErrorMessage)).size).toBe(ERRORS.length);
  });

  it("빈 문구를 내지 않는다", () => {
    for (const error of ERRORS) {
      expect(connectErrorMessage(error).trim().length).toBeGreaterThan(0);
    }
  });

  it("영어 토큰을 그대로 흘리지 않는다 — 읽는 사람은 비개발자 동료다 (PRODUCT §3)", () => {
    for (const error of ERRORS) {
      expect(connectErrorMessage(error)).not.toContain(error);
    }
  });

  it("모르는 값에 던지지 않고 폴백한다 — `?e=`는 사용자가 손댈 수 있다", () => {
    const fallback = connectErrorMessage("무엇이든" as ConnectError);
    expect(fallback.trim().length).toBeGreaterThan(0);
  });
});

describe("connectErrorMessage — 재시도가 유효한 사유만 그렇게 말한다", () => {
  it("`unavailable`만 '잠시'를 권한다", () => {
    // 원인이 고정된 거부에 "잠시 뒤 다시"를 보이면 사용자가 같은 버튼을 반복해서 누른다 —
    // 2026-09-05 preview 실측에서 `OAuthAccountNotLinked`가 정확히 그 모양이었다.
    expect(connectErrorMessage("unavailable")).toMatch(/in a moment/i);
    for (const error of ERRORS.filter((e) => e !== "unavailable")) {
      expect(connectErrorMessage(error)).not.toMatch(/in a moment/i);
    }
  });

  it("고정된 거부는 사용자가 할 수 있는 일을 말한다 — 막힌 이유만 알려주면 갇힌다", () => {
    // `taken-by-other`는 연결 해제(DESIGN §6.67)가, 나머지 둘은 GitHub 쪽 권한이 답이다.
    // ⚠️ 길이로 재지 않는다 (audit #90) — 폴백 문구도 10자를 넘어서 매핑이 통째로 빠져도 green이었다.
    const fallback = m.errors.connect.fallback;
    expect(connectErrorMessage("taken-by-other")).toBe(m.errors.connect["taken-by-other"]);
    expect(connectErrorMessage("taken-by-other")).toMatch(/disconnect/i);
    for (const error of ["installation-forbidden", "repo-forbidden"] as const) {
      expect(connectErrorMessage(error)).toBe(m.errors.connect[error]);
      expect(connectErrorMessage(error)).toMatch(/ask the repository owner/i);
    }
    for (const error of ["taken-by-other", "installation-forbidden", "repo-forbidden"] as const) {
      expect(connectErrorMessage(error)).not.toBe(fallback);
    }
  });
});

describe("AccessError와 겹치는 값 하나", () => {
  it("`unavailable`은 두 union에 다 있다 — 착지 화면의 판정 순서가 의도된 것임을 고정한다", () => {
    // `/projects`는 `isAccessError`를 먼저 보므로 `unavailable`은 그쪽 문구로 나온다. 두 문구가
    // 같은 뜻이라 문제가 아니지만, 순서를 바꿔도 되는 것으로 오해하면 다른 값에서 사고가 난다.
    expect(isConnectError("unavailable")).toBe(true);
    expect(isAccessError("unavailable")).toBe(true);
  });

  it("나머지 열한 사유는 `isAccessError`가 걸러내지 못한다 — 그래서 착지 화면에 분기가 필요하다", () => {
    for (const error of ERRORS.filter((e) => e !== "unavailable")) {
      expect(isAccessError(error)).toBe(false);
    }
  });
});

/**
 * ⚠️ **`satisfies`는 잉여 키를 못 잡는다** (2026-09-08 code-review ⚪9). `m.errors.x satisfies
 * Record<Union, string>`은 **없는 키**를 컴파일 에러로 만들지만, union에서 갈래를 지웠을 때 사전에 남는
 * **죽은 문구**에는 침묵한다(신선한 객체 리터럴이 아니라 excess property check가 안 걸린다).
 * 그래서 반대 방향은 런타임으로 센다.
 */
describe("사전에 죽은 문구가 남지 않는다", () => {
  it("errors.connect의 키가 전부 ConnectError다 (fallback 제외)", () => {
    for (const key of Object.keys(m.errors.connect)) {
      if (key === "fallback") continue;
      expect(isConnectError(key), key).toBe(true);
    }
  });
});
