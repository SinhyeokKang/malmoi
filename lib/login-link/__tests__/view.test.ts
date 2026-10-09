import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

import { encodeUserFields } from "@/lib/credentials/records";

import { challengeIdentifier, type Challenge } from "../policy";
import { challengeTokenHash } from "../store";
import { loadChallengeView } from "../view";

/**
 * 병합 확인 화면의 값 (ARCHITECTURE "계정 병합"). 확인 상대는 **켜진** 연결 수단 중에서만 고른다
 * (optional-login-providers spec §4.7) — 없으면 `null`이고 호출부가 `/signin`으로 되돌린다.
 */

const TOKEN = "raw-challenge";
const challenge: Challenge = { userId: "u1", provider: "google", providerAccountId: "g1", dest: { kind: "projects" } };

function fixture(accounts: { provider: string }[]) {
  const findMany = vi.fn().mockResolvedValue(accounts);
  const db = {
    verificationToken: {
      findFirst: vi.fn().mockResolvedValue({ identifier: challengeIdentifier(challenge), token: challengeTokenHash(TOKEN), expires: new Date(Date.now() + 300_000) }),
    },
    account: { findMany },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "u1",
        ...encodeUserFields("u1", { email: "alice@example.com", name: "Alice", image: null }),
        createdAt: new Date("2026-09-01T00:00:00Z"),
      }),
    },
  } as unknown as PrismaClient;
  return { db, findMany };
}

it("켜진 연결 수단으로 확인 상대를 고른다", async () => {
  const { db } = fixture([{ provider: "github" }]);
  const view = await loadChallengeView(db, TOKEN, new Date(), ["github", "google"]);
  expect(view).toMatchObject({ have: "github", pending: "google", emailLabel: expect.stringContaining("@example.com") });
});

it("꺼진 공급자만 연결돼 있으면 null이다 — 확인 왕복이 성립하지 않는다", async () => {
  const { db, findMany } = fixture([{ provider: "github" }]);
  expect(await loadChallengeView(db, TOKEN, new Date(), ["google"])).toBeNull();
  // 우주 전체를 읽는다 — 숨김은 판정이 정한다.
  expect(findMany).toHaveBeenCalledWith({ where: { userId: "u1", provider: { in: ["github", "google"] } }, select: { provider: true } });
});

it("켜진 집합이 비면 null이다", async () => {
  const { db } = fixture([{ provider: "github" }]);
  expect(await loadChallengeView(db, TOKEN, new Date(), [])).toBeNull();
});
