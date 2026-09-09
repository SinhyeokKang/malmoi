import { describe, expect, it } from "vitest";
import { checkBearer, statusFor } from "../auth";

const TOKEN = "s3cret-token-value";

describe("checkBearer — fail-closed", () => {
  it("환경변수가 undefined면 통과하지 않는다", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, undefined)).toBe("not-configured");
  });

  it("환경변수가 빈 문자열이어도 통과하지 않는다 (Vercel의 미입력 변수가 이렇게 온다)", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, "")).toBe("not-configured");
  });

  it("미설정은 500이다 — 클라이언트 잘못이 아니라 서버 설정 누락이다", () => {
    expect(statusFor("not-configured")).toBe(500);
  });
});

describe("checkBearer — 헤더", () => {
  it("헤더가 없으면 거부", () => {
    expect(checkBearer(null, TOKEN)).toBe("missing-header");
  });

  it("Bearer 접두사가 없으면 거부", () => {
    expect(checkBearer(TOKEN, TOKEN)).toBe("missing-header");
    expect(checkBearer(`Token ${TOKEN}`, TOKEN)).toBe("missing-header");
  });

  it("맞는 토큰은 통과", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
  });

  it("틀린 토큰은 거부 (길이 같음·다름 모두)", () => {
    expect(checkBearer(`Bearer ${"x".repeat(TOKEN.length)}`, TOKEN)).toBe("bad-token");
    expect(checkBearer("Bearer short", TOKEN)).toBe("bad-token");
  });

  it("접두사만 있고 값이 없으면 거부", () => {
    expect(checkBearer("Bearer ", TOKEN)).toBe("bad-token");
  });

  it("거부는 401이다", () => {
    expect(statusFor("missing-header")).toBe(401);
    expect(statusFor("bad-token")).toBe(401);
  });
});

/**
 * **비ASCII 입력이 던지면 401이 500이 된다** (sec-audit 발견 6).
 *
 * 길이 사전검사가 `String.length`(UTF-16 코드 유닛)인데 `timingSafeEqual`이 받는 것은
 * `Buffer`(UTF-8 바이트)다. 한글 한 글자는 코드 유닛 1 · 바이트 3이라, **같은 `length`인데 버퍼
 * 길이가 다른 쌍**이 존재하고 그때 `timingSafeEqual`이 `RangeError`를 던진다.
 *
 * ⚠️ **사유는 맞았고 재는 단위가 틀렸다** — 주석이 "길이가 다르면 던지므로 먼저 걸러낸다"고
 * 정확히 적어 놓고 다른 자를 썼다.
 *
 * 던지면 라우트의 `catch`가 그것을 500으로 접는다 — **거부가 장애로 위장된다**(ARCHITECTURE §6.3).
 */
describe("checkBearer — 비ASCII (sec-audit 6)", () => {
  it("길이는 같고 바이트는 다른 토큰에 던지지 않는다", () => {
    // "가"는 코드 유닛 1 · UTF-8 3바이트다 — 옛 사전검사를 그대로 통과하고 버퍼에서 갈린다.
    expect(() => checkBearer("Bearer 가", "a")).not.toThrow();
    expect(checkBearer("Bearer 가", "a")).toBe("bad-token");
  });

  it("길이도 바이트도 다른 비ASCII에도 값으로 답한다", () => {
    expect(checkBearer("Bearer 안녕하세요", TOKEN)).toBe("bad-token");
    expect(checkBearer(`Bearer ${TOKEN}`, "가나다")).toBe("bad-token");
  });

  it("정상 토큰은 그대로 통과한다 — 비교 방식이 바뀌어도 계약은 같다", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
  });

  it("이모지·서로게이트 쌍도 던지지 않는다", () => {
    expect(() => checkBearer("Bearer 🎉", "ab")).not.toThrow();
    expect(checkBearer("Bearer 🎉", "ab")).toBe("bad-token");
  });
});
