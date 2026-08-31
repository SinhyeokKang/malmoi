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
