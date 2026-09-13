import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sealPii, openPii, sealToken, openToken, lookupEmail } from "../storage";
beforeEach(() => {
  for (const prefix of ["PII", "TOKEN"]) {
    vi.stubEnv(`${prefix}_ENCRYPTION_KEYS`, JSON.stringify({ k1: Buffer.alloc(32, prefix === "PII" ? 1 : 2).toString("base64") }));
    vi.stubEnv(`${prefix}_ENCRYPTION_ACTIVE_KEY_ID`, "k1");
  }
  vi.stubEnv("EMAIL_LOOKUP_KEY", Buffer.alloc(32, 3).toString("base64"));
  vi.stubEnv("EMAIL_LOOKUP_KEY_ID", "k1");
});
afterEach(() => vi.unstubAllEnvs());
it("개인정보는 행·컬럼·프로젝트에 묶이며 NULL을 유지한다", () => {
  const ctx = { table: "User" as const, id: "u1", field: "email" as const };
  const value = sealPii("a@example.com", ctx)!;
  expect(openPii(value, ctx)).toBe("a@example.com");
  expect(() => openPii(value, { ...ctx, id: "u2" })).toThrow();
  expect(() => openPii(value, { ...ctx, field: "name" })).toThrow();
  expect(sealPii(null, ctx)).toBeNull();
  expect(openPii(null, ctx)).toBeNull();
  expect(sealPii("a@example.com", ctx)).not.toBe(value);
});
it("App 토큰은 계정·사용자·필드에 묶인다", () => {
  const ctx = { userId: "u1", providerAccountId: "42", field: "access_token" as const };
  const value = sealToken("secret", ctx)!;
  expect(openToken(value, ctx)).toBe("secret");
  expect(() => openToken(value, { ...ctx, userId: "u2" })).toThrow();
  expect(() => openToken(value, { ...ctx, field: "refresh_token" })).toThrow();
});
it("키는 지연 로드하고 누락·평문 fallback을 거부한다", () => {
  expect(() => openPii("plaintext", { table: "User", id: "u1", field: "email" })).toThrow();
  vi.stubEnv("PII_ENCRYPTION_KEYS", "");
  expect(() => sealPii("secret", { table: "User", id: "u1", field: "email" })).toThrow();
});
it("이메일 조회 키는 프로젝트별로 분리한다", () => {
  expect(lookupEmail(" A@X.COM ")).toBe(lookupEmail("a@x.com"));
  expect(lookupEmail("a@x.com", "p1")).not.toBe(lookupEmail("a@x.com", "p2"));
});
it("PII 쓰기 사전 검증은 활성 키가 실제 keyring에 있어야 통과한다", async () => {
  const { validatePiiWriteKey } = await import("../storage");
  expect(() => validatePiiWriteKey()).not.toThrow();
  for (const kid of ["", "missing"]) {
    vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", kid);
    expect(() => validatePiiWriteKey()).toThrow();
  }
});
