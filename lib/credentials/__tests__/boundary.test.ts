import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { credentialAdapter } from "../adapter";
import { validateCredentialKeys } from "../storage";
it("adapter failures contain neither Prisma arguments nor nested secrets", async () => {
  const error = Object.assign(new Error("plain@example.com enc:v1:secret hmac:v1:secret"), { cause: { token: "secret" } });
  const adapter = credentialAdapter({ user: { findUnique: vi.fn().mockRejectedValue(error) } } as unknown as PrismaClient);
  try { await adapter.getUser!("u1"); throw new Error("expected failure"); }
  catch (failure) { expect(failure).toMatchObject({ message: "credential storage unavailable" }); expect(failure).not.toHaveProperty("cause"); }
});
it("preflight rejects reused encryption and lookup keys", () => {
  expect(() => validateCredentialKeys()).not.toThrow();
  vi.stubEnv("PII_ENCRYPTION_KEYS", process.env.TOKEN_ENCRYPTION_KEYS!);
  try { expect(() => validateCredentialKeys()).toThrow("credential storage unavailable"); }
  finally { vi.unstubAllEnvs(); }
});
