import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { credentialIO, refreshVerifiedEmail } from "../access";
import { credentialTarget } from "../command";
import { CredentialError } from "../crypto";
import { validateCredentialKeys } from "../storage";

/**
 * **자격증명 경로의 무로그 삼킴** (launch-readiness L5.1, POSTMORTEM 2026-09-14 후속). PII 키 하나가 빠지면 로그인·초대가
 * 전부 "Unavailable"인데 서버 로그가 0줄이었다 — 원인을 볼 곳이 없었다. 원인이 `CredentialError`로 바뀌는 자리마다
 * 한 줄을 남기되 **원문은 안 남긴다**(Prisma 인자·암호문이 실린다 — `lib/failure.ts` `classifyFailure`와 같은 규칙).
 */
let spy: { mock: { calls: unknown[][] }; mockClear: () => void; mockRestore: () => void };
beforeEach(() => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { spy.mockRestore(); vi.unstubAllEnvs(); });
const lines = () => spy.mock.calls.map((call: unknown[]) => String(call[0]));

it("credentialIO — 남의 오류는 분류 한 줄, 원문 없음", async () => {
  await expect(credentialIO(async () => { throw new Error("secret prisma argument"); })).rejects.toBeInstanceOf(CredentialError);
  expect(lines()).toEqual([expect.stringMatching(/^\[credentials\] \w{8} credential-io: Error$/)]);
});

it("credentialIO — 성공은 0줄, 이미 바뀐 CredentialError는 다시 안 찍는다", async () => {
  await expect(credentialIO(async () => 1)).resolves.toBe(1);
  await expect(credentialIO(async () => { throw new CredentialError(); })).rejects.toBeInstanceOf(CredentialError);
  expect(lines()).toEqual([]);
});

it("refreshVerifiedEmail — 장애는 한 줄, 충돌(P2002)과 성공은 0줄", async () => {
  const failing = { account: { findUnique: vi.fn().mockRejectedValue(new Error("secret row")) } } as unknown as PrismaClient;
  await expect(refreshVerifiedEmail(failing, "github", "1", "a@x.com")).rejects.toBeInstanceOf(CredentialError);
  expect(lines()).toEqual([expect.stringMatching(/refresh-email: Error$/)]);
  spy.mockClear();
  const conflict = { account: { findUnique: vi.fn().mockResolvedValue({ userId: "u" }) }, $transaction: vi.fn().mockRejectedValue({ code: "P2002" }) } as unknown as PrismaClient;
  expect(await refreshVerifiedEmail(conflict, "github", "1", "a@x.com")).toBe("conflict");
  const unlinked = { account: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient;
  expect(await refreshVerifiedEmail(unlinked, "github", "1", "a@x.com")).toBe("unlinked");
  expect(lines()).toEqual([]);
});

// ⚠️ **변수 이름은 남긴다** — `MissingEnvError`는 우리가 만든 오류이고 이름만 담는다. 전에는 그것까지 버려 어느 키가 빠졌는지 몰랐다.
it("키 환경변수가 빠지면 그 변수 이름을 한 줄 남긴다", () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEYS", "");
  expect(() => validateCredentialKeys()).toThrow(CredentialError);
  expect(lines()).toEqual([expect.stringMatching(/credential-env: missing environment variable TOKEN_ENCRYPTION_KEYS/)]);
});

it("credentialTarget — 접속 URL 파싱 실패는 분류만 남고 URL은 안 남는다", () => {
  expect(() => credentialTarget({ CREDENTIAL_TARGET: "dev", DIRECT_URL: "not a url with password hunter2" })).toThrow(CredentialError);
  expect(lines()).toEqual([expect.stringMatching(/credential-target: TypeError$/)]);
  expect(lines().join("\n")).not.toContain("hunter2");
});
