import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { decrypt, encrypt, parseKeyring, emailLookup, hashSessionToken, isSessionValid } from "../crypto";
const key = Buffer.alloc(32, 1);
const ring = new Map([["k1", key]]);
const aad = JSON.stringify(["pii", "User", "u1", "email"]);
const nonce = Buffer.alloc(12, 2);
describe("credential encryption", () => {
  it("한글·빈 문자열을 인증 복호화한다", () => {
    for (const value of ["", "한글 🐱", "a@example.com"]) {
      const sealed = encrypt(value, aad, "k1", key, nonce);
      expect(decrypt(sealed, aad, ring)).toBe(value);
      expect(sealed).not.toContain("example");
    }
  });
  it("다른 행·컬럼·키와 변조를 거부한다", () => {
    const sealed = encrypt("secret", aad, "k1", key, nonce);
    expect(() => decrypt(sealed, aad + "x", ring)).toThrow();
    expect(() => decrypt(sealed, aad, new Map([["k1", Buffer.alloc(32, 3)]]))).toThrow();
    for (const index of [3, 4, 5]) {
      const parts = sealed.split(":");
      const part = parts[index]!;
      parts[index] = (part[0] === "A" ? "B" : "A") + part.slice(1);
      expect(() => decrypt(parts.join(":"), aad, ring)).toThrow();
    }
    for (const value of ["plaintext", sealed + ":extra", sealed.replace("v1", "v2"), sealed.replace("k1", "missing")]) {
      expect(() => decrypt(value, aad, ring)).toThrow();
    }
  });
  it("키·nonce 길이와 비정규 인코딩을 거부한다", () => {
    expect(() => encrypt("x", aad, "k1", Buffer.alloc(16), nonce)).toThrow();
    expect(() => encrypt("x", aad, "k1", key, Buffer.alloc(8))).toThrow();
    expect(() => parseKeyring('{"k1":"YQ=="}')).toThrow();
    expect(() => parseKeyring("null")).toThrow();
    expect(() => parseKeyring("[]")).toThrow();
    expect(parseKeyring(JSON.stringify({ k1: key.toString("base64") })).get("k1")).toEqual(key);
  });
  it("같은 값도 nonce가 다르면 암호문이 다르다", () => {
    expect(encrypt("x", aad, "k1", key, nonce)).not.toBe(encrypt("x", aad, "k1", key, Buffer.alloc(12, 3)));
  });
  it("AES-256-GCM 알려진 벡터와 일치한다", () => {
    const value = encrypt("", "", "zero", Buffer.alloc(32), Buffer.alloc(12));
    expect(Buffer.from(value.split(":")[5]!, "base64url").toString("hex")).toBe("530f8afbc74536b9a963b4f1c4cb738b");
  });
});
describe("lookup and session", () => {
  it("이메일 검색은 scope별 HMAC이며 기존 정규화를 유지한다", () => {
    const expected = createHmac("sha256", key).update(JSON.stringify(["malmoi/email-lookup", "v1", "user", "a@example.com"])).digest("hex");
    expect(emailLookup(" A@Example.com ", "user", key, "k1")).toBe(`hmac:v1:k1:${expected}`);
    expect(emailLookup("a@example.com", "user", key, "k1")).not.toBe(emailLookup("a@example.com", "invitation:p1", key, "k1"));
    expect(emailLookup("a+x@example.com", "user", key, "k1")).not.toBe(emailLookup("a@example.com", "user", key, "k1"));
  });
  it("DB digest를 bearer로 재사용할 수 없도록 다시 해시한다", () => {
    const hashed = hashSessionToken("raw");
    expect(hashed).toMatch(/^sha256:v1:[a-f0-9]{64}$/);
    expect(hashSessionToken(hashed)).not.toBe(hashed);
  });
  it("만료 경계와 잘못된 날짜에서 거부한다", () => {
    expect(isSessionValid(new Date(100), new Date(99))).toBe(true);
    expect(isSessionValid(new Date(100), new Date(100))).toBe(false);
    expect(isSessionValid(new Date(NaN), new Date(0))).toBe(false);
  });
});
