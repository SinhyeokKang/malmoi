import { timingSafeEqual } from "node:crypto";

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
  // 길이가 다르면 timingSafeEqual이 던지므로 먼저 걸러낸다. 길이 노출은 감수한다 —
  // 토큰 길이는 비밀이 아니다.
  if (given.length !== expected.length) return "bad-token";
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return timingSafeEqual(a, b) ? "ok" : "bad-token";
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
