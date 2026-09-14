import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
vi.mock("server-only", () => ({}));
import { credentialAdapter } from "../adapter";
import { hashSessionToken } from "../crypto";
import { encodeUserFields } from "../records";
beforeEach(() => {
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  vi.stubEnv("EMAIL_LOOKUP_KEY", Buffer.alloc(32, 2).toString("base64"));
  vi.stubEnv("EMAIL_LOOKUP_KEY_ID", "k1");
});
afterEach(() => vi.unstubAllEnvs());
it.each([null, "https://store.public.blob.vercel-storage.com/avatars/u1/n.png"])("재로그인은 사용자 사진 %s를 덮지 않는다", async (image) => {
  const row = { id: "u1", emailVerified: null, ...encodeUserFields("u1", { email: "a@x.com", image }) };
  const update = vi.fn(async ({ data }) => ({ ...row, ...data }));
  const adapter = credentialAdapter({ user: { update } } as unknown as PrismaClient);
  expect(await adapter.updateUser!({ id: "u1", image: "https://avatars.githubusercontent.com/u/1", emailVerified: new Date(0) })).toMatchObject({ image, emailVerified: new Date(0) });
  expect(update.mock.calls[0]![0].data).not.toHaveProperty("image");
});
it("세션 생성은 DB에 해시, Auth.js에는 원문을 반환한다", async () => {
  const create = vi.fn(async ({ data }) => data);
  const adapter = credentialAdapter({ session: { create } } as unknown as PrismaClient);
  const input = { sessionToken: "secret", userId: "u1", expires: new Date(Date.now() + 10000) };
  expect(await adapter.createSession!(input)).toEqual(input);
  expect(create.mock.calls[0]![0].data.sessionToken).toBe(hashSessionToken("secret"));
});
it("OAuth 조회도 만료를 거부하고 유효 user만 복호화한다", async () => {
  const user = { id: "u1", emailVerified: null, ...encodeUserFields("u1", { email: "a@x.com" }) };
  const findUnique = vi.fn().mockResolvedValue({ sessionToken: hashSessionToken("secret"), userId: "u1", expires: new Date(100), user });
  const adapter = credentialAdapter({ session: { findUnique, deleteMany: vi.fn() } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.getSessionAndUser!("secret")).toBeNull();
  findUnique.mockResolvedValue({ sessionToken: hashSessionToken("secret"), userId: "u1", expires: new Date(101), user });
  expect(await adapter.getSessionAndUser!("secret")).toMatchObject({ session: { sessionToken: "secret" }, user: { email: "a@x.com" } });
  await adapter.getSessionAndUser!(hashSessionToken("secret"));
  expect(findUnique).toHaveBeenLastCalledWith({ where: { sessionToken: hashSessionToken(hashSessionToken("secret")) }, include: { user: true } });
});
it("삭제된 세션을 갱신으로 생성하지 않는다", async () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const adapter = credentialAdapter({ session: { updateMany } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.updateSession!({ sessionToken: "secret", expires: new Date(1000) })).toBeNull();
  expect(updateMany.mock.calls[0]![0].where.expires).toEqual({ gt: new Date(100) });
});
it("DB 장애를 세션 없음으로 삼키지 않는다", async () => {
  const adapter = credentialAdapter({ session: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) } } as unknown as PrismaClient);
  await expect(adapter.getSessionAndUser!("secret")).rejects.toThrow();
});
it("암호화 어댑터도 기존 사용자에 추가 로그인 계정을 연결하지 않는다", async () => {
  const create = vi.fn();
  const tx = { $executeRaw: vi.fn(), account: { findFirst: vi.fn().mockResolvedValue({ provider: "google" }), create } };
  const adapter = credentialAdapter({ account: { create }, $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient);
  await expect(adapter.linkAccount!({ userId: "u1", provider: "github", providerAccountId: "attacker", type: "oauth" })).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});
it("만료 세션 정리는 digest와 현재 만료 조건을 함께 사용한다", async () => {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const adapter = credentialAdapter({ session: { findUnique: vi.fn().mockResolvedValue({ expires: new Date(99) }), deleteMany } } as unknown as PrismaClient, () => new Date(100));
  expect(await adapter.getSessionAndUser!("raw")).toBeNull();
  expect(deleteMany).toHaveBeenCalledWith({ where: { sessionToken: hashSessionToken("raw"), expires: { lte: new Date(100) } } });
});

/**
 * ⚠️ **R2가 `emailLookup`에 NOT NULL을 걸지 않기로 했으므로**(전환 도구가 미변환 행을
 * `emailLookup: null`로 집어야 한다 — `20260910060000_finalize_credential_storage`) 그 값이 비지
 * 않는다는 보증은 여기 하나뿐이다. 빠진 행은 unique 인덱스에 안 걸려 **이메일로 영영 못 찾는
 * 사용자**가 되고, 같은 주소로 다시 가입하면 중복 계정이 조용히 생긴다.
 */
it("createUser는 lookup 없이 행을 쓰지 않는다", async () => {
  // 가짜 create는 쓴 행을 그대로 돌려준다 — 어댑터가 그것을 복호화해 반환하기 때문이다.
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => args.data);
  const adapter = credentialAdapter({ user: { create } } as unknown as PrismaClient);
  await adapter.createUser!({ id: "ignored", email: "a@x.com", emailVerified: null });
  const written = create.mock.calls[0]![0].data as { email: unknown; emailLookup: unknown };
  expect(typeof written.emailLookup).toBe("string");
  // 봉투가 아니라 HMAC이다 — 둘을 바꿔 쓰면 조회가 매번 어긋난다.
  expect(String(written.emailLookup)).toMatch(/^hmac:v1:/);
  expect(String(written.email)).toMatch(/^enc:v1:/);
});

/**
 * ⚠️ **이름을 덮는 실제 통로는 `updateUser` 하나다** (account-settings 태스크 2). `planEmailRefresh`가
 * 아니다 — 그 함수는 입력 넷이 전부 이메일이고 이름 축이 없다.
 *
 * **이 테스트는 위험을 고정한다**: 누군가 provider profile을 이 메서드에 통째로 넘기면 사용자가
 * 고친 이름이 조용히 사라진다. 지금 그것이 안 일어나는 이유는 아래 `access.test.ts`의 짝
 * (재로그인 경로가 이 메서드를 안 부른다)이고, 둘이 함께 있어야 계약이 된다.
 */
it("updateUser에 name이 들어오면 사용자가 고친 이름을 봉투로 덮는다", async () => {
  const row = { id: "u1", emailVerified: null, ...encodeUserFields("u1", { email: "a@x.com", name: "Edited by the user" }) };
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
  const adapter = credentialAdapter({ user: { update } } as unknown as PrismaClient);
  expect(await adapter.updateUser!({ id: "u1", name: "Provider display name" })).toMatchObject({ name: "Provider display name" });
  // 평문이 들어가면 다음 `decodeUser`가 `CredentialError`로 죽는다 — 봉투를 지났는지까지 센다.
  expect(String(update.mock.calls[0]![0].data["name"])).toMatch(/^enc:v1:/);
});
