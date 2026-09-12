import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import { beginLink, finishLink, loadLinkOffer } from "../store";
import { challengeIdentifier, challengeTokenHash } from "../policy";

const TOKEN = "raw-challenge";
const challenge = {
  userId: "u",
  provider: "google" as const,
  providerAccountId: "g1",
  dest: { kind: "invite" as const, token: "inv" },
};
const confirming = { provider: "github", providerAccountId: "gh1" };

function fixture(overrides: { pending?: unknown; confirmed?: unknown; expires?: Date } = {}) {
  const row = {
    identifier: challengeIdentifier(challenge),
    token: challengeTokenHash(TOKEN),
    expires: overrides.expires ?? new Date(Date.now() + 300_000),
  };
  const account = {
    findUnique: vi.fn(async ({ where }: { where: { provider_providerAccountId: { provider: string } } }) =>
      where.provider_providerAccountId.provider === "github"
        ? (overrides.confirmed ?? { userId: "u" })
        : (overrides.pending ?? null),
    ),
    findMany: vi.fn().mockResolvedValue([{ provider: "github" }]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "u" }]),
    account,
    verificationToken: {
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaClient;
  return { db, tx, row };
}

it("challenge는 해시만 저장하고 자기 접두 안에서만 이전 시도를 지운다", async () => {
  const { db, tx } = fixture();
  const token = await beginLink(db, challenge);
  expect(token).toMatch(/^[\w-]{43}$/);
  expect(tx.verificationToken.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ token: challengeTokenHash(token!), identifier: challengeIdentifier(challenge) }),
  });
  // ⚠️ 넓게 지우면 `session-revocation`의 목적을 소비한다.
  expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({
    where: { identifier: { startsWith: '["malmoi/login-link","v1","u",' } },
  });
  expect(tx.verificationToken.create.mock.calls[0]![0].data.identifier).not.toContain(token);
});

it("확인이 일치하면 붙일 수단을 추가하고 challenge를 조건부로 소비한다", async () => {
  const { db, tx, row } = fixture();
  expect(await finishLink(db, { challengeToken: TOKEN, confirming })).toEqual({ outcome: "linked", dest: challenge.dest });
  expect(tx.account.create).toHaveBeenCalledWith({
    data: { userId: "u", type: "oauth", provider: "google", providerAccountId: "g1" },
  });
  // 소비는 조건부 삭제의 count가 강제한다 — 동시 요청 둘 중 하나만 성공한다.
  expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({
    where: { identifier: row.identifier, token: row.token, expires: expect.objectContaining({ equals: row.expires }) },
  });
  expect(tx.$queryRaw).toHaveBeenCalled();
});

it("다른 계정으로 확인하면 아무것도 쓰지 않고 challenge가 살아 있다", async () => {
  const { db, tx } = fixture({ confirmed: { userId: "other" } });
  expect(await finishLink(db, { challengeToken: TOKEN, confirming })).toEqual({
    outcome: "wrong-account",
    dest: challenge.dest,
  });
  expect(tx.account.create).not.toHaveBeenCalled();
  expect(tx.verificationToken.deleteMany).not.toHaveBeenCalled();
});

it("처음 보는 확인 계정도 wrong-account다 — 행을 만들지 않는다", async () => {
  const { db, tx } = fixture({ confirmed: null });
  expect((await finishLink(db, { challengeToken: TOKEN, confirming })).outcome).toBe("wrong-account");
  expect(tx.account.create).not.toHaveBeenCalled();
});

it("이미 붙어 있으면 already-linked이고 쓰기가 0이다", async () => {
  const { db, tx } = fixture({ pending: { userId: "u" } });
  expect((await finishLink(db, { challengeToken: TOKEN, confirming })).outcome).toBe("already-linked");
  expect(tx.account.create).not.toHaveBeenCalled();
  expect(tx.verificationToken.deleteMany).not.toHaveBeenCalled();
});

it("만료된 challenge는 소비하지 않고 만료로 답한다", async () => {
  const { db, tx } = fixture({ expires: new Date(Date.now() - 1000) });
  expect((await finishLink(db, { challengeToken: TOKEN, confirming })).outcome).toBe("expired");
  expect(tx.account.create).not.toHaveBeenCalled();
});

it("소비 경쟁에서 진 요청은 아무것도 쓰지 않는다", async () => {
  const { db, tx } = fixture();
  tx.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  expect((await finishLink(db, { challengeToken: TOKEN, confirming })).outcome).toBe("invalid");
  expect(tx.account.create).not.toHaveBeenCalled();
});

it("행이 없으면 invalid다 — 단일 사용 뒤 재시도가 여기로 온다", async () => {
  const { db, tx } = fixture();
  tx.verificationToken.findFirst.mockResolvedValue(null);
  expect(await finishLink(db, { challengeToken: TOKEN, confirming })).toEqual({ outcome: "invalid", dest: null });
});

it("DB 장애는 unavailable이고 남의 메시지를 싣지 않는다", async () => {
  const { db } = fixture();
  (db.$transaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("PRIVATE"));
  expect(await finishLink(db, { challengeToken: TOKEN, confirming })).toEqual({ outcome: "unavailable", dest: null });
  expect(await beginLink(db, challenge)).toBeNull();
});

it("조회는 새 Account일 때만 이메일을 본다 — 그 사용자의 수단만 센다", async () => {
  const findMany = vi.fn().mockResolvedValue([{ provider: "github" }, { provider: "github-app" }]);
  const db = { account: { findMany }, user: {} } as unknown as PrismaClient;
  vi.resetModules();
  const offer = await loadLinkOffer(
    { ...db, user: { findUnique: vi.fn() } } as unknown as PrismaClient,
    { provider: "google", providerAccountId: "g1", verifiedEmail: "" },
  );
  // 빈 이메일은 조회 없이 거부다 — 이메일이 같을 때만 병합한다.
  expect(offer).toEqual({ kind: "reject" });
  expect(findMany).not.toHaveBeenCalled();
});
