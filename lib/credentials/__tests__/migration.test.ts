import { expect, it } from "vitest";
import { classifyCredential, migrateAccountFields, migratePersonalFields, assertUniqueEmails } from "../migration";
import { decodeUser, encodeUserFields } from "../records";
import { openToken } from "../storage";
const account = { userId: "u1", provider: "github-app", providerAccountId: "42", access_token: "legacy", refresh_token: "refresh", id_token: null, expires_at: 17 };
it("classifies legacy, envelopes, and malformed reserved formats without guessing", () => {
  expect(classifyCredential(null)).toBe("null");
  expect(classifyCredential("legacy")).toBe("legacy");
  expect(classifyCredential("enc:v2:bad")).toBe("envelope");
  expect(() => migrateAccountFields({ ...account, access_token: "enc:v2:bad" }, "backfill")).toThrow();
});
it("encrypts App token pairs, preserves expiry, and is restartable", () => {
  const patch = migrateAccountFields(account, "backfill")!;
  const stored = { ...account, ...patch };
  expect(stored.expires_at).toBe(17);
  expect(openToken(stored.access_token, { userId: "u1", providerAccountId: "42", field: "access_token" })).toBe("legacy");
  expect(migrateAccountFields(stored, "backfill")).toBeNull();
  expect(migrateAccountFields(stored, "verify")).toBeNull();
  expect(() => migrateAccountFields(account, "verify")).toThrow();
});
it("clears login secrets, rejects unknown secret-bearing providers", () => {
  expect(migrateAccountFields({ ...account, provider: "google", id_token: "identity" }, "backfill")).toEqual({ access_token: null, refresh_token: null, id_token: null });
  expect(() => migrateAccountFields({ ...account, provider: "unknown" }, "backfill")).toThrow();
});
it("preserves identities and encrypts each PII field with its lookup atomically", () => {
  const user = { id: "u1", email: " A@EXAMPLE.COM ", emailLookup: null, name: "Alice", image: null };
  const patch = migratePersonalFields(user, "User", "backfill")!;
  const stored = { ...user, ...patch };
  expect(decodeUser(stored)).toMatchObject({ id: "u1", email: "a@example.com", name: "Alice", image: null });
  expect(migratePersonalFields(stored, "User", "backfill")).toBeNull();
  expect(migratePersonalFields(stored, "User", "verify")).toBeNull();
  expect(() => migratePersonalFields({ ...stored, emailLookup: "wrong" }, "User", "verify")).toThrow();
});
it("detects normalized collisions before any write, including mixed storage", () => {
  expect(() => assertUniqueEmails([{ id: "u1", email: "A@X.COM" }, { id: "u2", ...encodeUserFields("u2", { email: "a@x.com" }), email: encodeUserFields("u2", { email: "a@x.com" }).email! }])).toThrow();
  expect(() => assertUniqueEmails([{ id: "u1", email: "a+x@x.com" }, { id: "u2", email: "a@x.com" }])).not.toThrow();
});
it("backfill refuses damaged prefixes and mixed storage in converted rows", () => {
  const stored = { id: "u1", ...encodeUserFields("u1", { email: "a@x.com", name: "Alice" }), email: encodeUserFields("u1", { email: "a@x.com" }).email! };
  expect(() => migratePersonalFields({ ...stored, name: stored.name!.replace(/^e/, "x") }, "User", "backfill")).toThrow();
  expect(() => migratePersonalFields({ ...stored, name: "totally damaged" }, "User", "backfill")).toThrow();
  const encrypted = { ...account, ...migrateAccountFields(account, "backfill")! };
  expect(() => migrateAccountFields({ ...encrypted, access_token: encrypted.access_token!.replace(/^e/, "x") }, "backfill")).toThrow();
  expect(() => migrateAccountFields({ ...encrypted, access_token: "totally damaged" }, "backfill")).toThrow();
});
