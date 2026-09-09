import { createHash, timingSafeEqual } from "node:crypto";

/**
 * CI가 보낸 Bearer 토큰 검증. **fail-closed** — 환경변수가 비어 있으면 아무도 통과하지 못한다.
 * 빈 값을 "인증 없음"으로 읽으면 설정 누락이 곧 공개 엔드포인트가 된다 (ARCHITECTURE §6).
 *
 * 순수 함수로 둬서 세 실패 경로(헤더 없음·토큰 틀림·환경변수 미설정)를 테스트로 고정한다.
 */
export type AuthResult = "ok" | "missing-header" | "bad-token" | "not-configured";

export function checkBearer(header: string | null, expected: string | undefined): AuthResult {
  // 환경변수 미설정을 통과로 읽지 않는다.
  if (expected === undefined || expected === "") return "not-configured";
  if (header === null || !header.startsWith("Bearer ")) return "missing-header";
  const given = header.slice("Bearer ".length);
  // ⚠️ **길이 사전검사를 두지 않는다** (2026-09-09, sec-audit 발견 6). 전에는 `String.length`로 재고
  // `timingSafeEqual`에 `Buffer`를 넘겼는데, 앞은 UTF-16 코드 유닛이고 뒤는 UTF-8 바이트다 —
  // `"가"`(코드 유닛 1 · 3바이트)가 `"a"`와 같은 길이로 통과해 **`RangeError`가 났다.** 헤더는
  // 공격자가 정하는 값이고, 던지면 라우트의 catch가 500으로 접어 **거부가 장애로 위장된다.**
  //
  // 해시하면 양쪽이 **항상 32바이트**라 길이 검사 자체가 사라진다 — 재는 자가 하나뿐이면
  // 어긋날 자리가 없다. `lib/github-connect/state.ts`의 `equalConstantTime`이 같은 규칙이다.
  return timingSafeEqual(sha256(given), sha256(expected)) ? "ok" : "bad-token";
}

/** 고정 길이(32바이트) digest. 비교의 두 자리가 이 함수 하나를 공유한다. */
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** 실패를 HTTP 상태로. 미설정은 서버 문제(500)이고 나머지는 클라이언트 문제(401)다. */
export function statusFor(result: AuthResult): number {
  switch (result) {
    case "ok":
      return 200;
    case "not-configured":
      return 500;
    default:
      return 401;
  }
}
