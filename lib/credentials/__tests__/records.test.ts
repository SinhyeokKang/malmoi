import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { encodeUserFields, decodeUser, decodeInvitation, encodeInvitationEmail } from "../records";
beforeEach(() => {
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  vi.stubEnv("EMAIL_LOOKUP_KEY", Buffer.alloc(32, 2).toString("base64"));
  vi.stubEnv("EMAIL_LOOKUP_KEY_ID", "k1");
});
afterEach(() => vi.unstubAllEnvs());
it("사용자 DTO는 암호문과 인덱스를 원문 허용 필드로 변환한다", () => {
  const fields = encodeUserFields("u1", { email: " A@X.COM ", name: "Kim", image: null });
  expect(fields.email).not.toContain("x.com");
  const decoded = decodeUser({ id: "u1", ...fields });
  expect(decoded).toEqual({ id: "u1", email: "a@x.com", name: "Kim", image: null });
  expect(encodeUserFields("u1", { name: undefined, image: null })).toEqual({ image: null });
});
it("초대는 다른 프로젝트로 옮겨 복호화할 수 없다", () => {
  const fields = encodeInvitationEmail("i1", "p1", " A@X.COM ");
  expect(decodeInvitation({ id: "i1", projectId: "p1", ...fields }).email).toBe("a@x.com");
  expect(() => decodeInvitation({ id: "i1", projectId: "p2", ...fields })).toThrow();
});
