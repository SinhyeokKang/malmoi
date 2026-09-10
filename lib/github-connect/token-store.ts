import { openToken, sealToken, validateTokenWriteKey } from "@/lib/credentials/storage";
import type { PrismaClient } from "@/generated/prisma/client";

import { httpStatus } from "./health";
import { logFailure } from "./log";
import { planTokenUse, refreshFailure } from "./token";
import { refreshUserToken } from "./user";

/**
 * `Account(provider: "github-app")`에서 쓸 수 있는 사용자 토큰을 얻는다 (design §2.4).
 * **판정은 `planTokenUse`·`refreshFailure`가 하고, 여기는 읽기·갱신·쓰기와 경합만 다룬다.**
 *
 * ⚠️ **갱신 결과를 즉시 쓴다.** GitHub의 refresh 토큰은 1회용(회전)이라 성공한 순간 이전 쌍이
 * 무효다 — 안 쓰면 다음 요청이 반드시 `reauthorize`다 (POSTMORTEM 2026-09-05 "검증은 했는데
 * 검증한 값을 저장하지 않아").
 *
 * ⚠️ **쓰기가 조건부인 이유.** 탭 둘이 같은 만료 토큰을 읽어 둘 다 갱신하면 GitHub이 둘째를
 * 거부한다. `where`에 **읽었던 `refresh_token`**을 넣어 진 쪽의 count를 0으로 만들고, 그때는 행을
 * 다시 읽어 이긴 쪽의 토큰을 쓴다 — `acceptInvitation`의 단일 사용과 같은 형태다 (ARCHITECTURE §6.3).
 */

export type UserToken =
  | { status: "ok"; accessToken: string }
  /** `Account` 행이 없다. 화면이 "GitHub 연결"을 보인다. */
  | { status: "not-connected" }
  /** 갱신할 수단이 없거나 갱신이 거부됐다. 화면이 "GitHub 다시 연결" 버튼을 보인다. */
  | { status: "reauthorize" }
  /** 조회·갱신이 장애로 실패했다 — 거부가 아니다. */
  | { status: "unavailable" };

const PROVIDER = "github-app";

/** 이 껍데기가 보는 컬럼만. */
type AccountRow = {
  providerAccountId: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

export async function ensureUserToken(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<UserToken> {
  try {
    const row = await readAccount(prisma, userId);
    if (row === null) return { status: "not-connected" };

    const plan = planTokenUse({
      expiresAt: toDate(row.expires_at),
      now,
      hasRefreshToken: row.refresh_token !== null,
    });
    if (plan === "use") return usable(row, userId);
    // `planTokenUse`가 refresh 토큰 없음을 이미 걸렀다 — 여기 오면 갱신 수단이 없다.
    if (plan === "reauthorize" || row.refresh_token === null) return { status: "reauthorize" };

    validateTokenWriteKey();
    const previous = row.refresh_token;
    let fresh;
    try {
      fresh = await refreshUserToken(openToken(previous, { userId, providerAccountId: row.providerAccountId, field: "refresh_token" })!);
    } catch (error) {
      // 갱신이 실패해도 **한 번 다시 읽는다** — 다른 요청이 이미 회전시켜 놓았을 수 있고,
      // 그때 사용자에게 재인가를 시키면 멀쩡한 연결을 지우게 만든다.
      const settled = await afterRace(prisma, userId, now);
      if (settled !== null) return settled;
      const failure = refreshFailure(httpStatus(error));
      // 거부(reauthorize)는 화면이 다음 행동을 말해 준다 — 로그가 필요한 것은 접힌 장애 쪽이다.
      if (failure === "unavailable") logFailure("refresh", error);
      return { status: failure };
    }

    const written = await prisma.account.updateMany({
      // ⚠️ `userId`는 `where`에만 있고 `data`에는 없다 — 넣으면 경합에서 소유권이 이동한다.
      where: { userId, provider: PROVIDER, providerAccountId: row.providerAccountId, refresh_token: previous },
      data: {
        access_token: sealToken(fresh.accessToken, { userId, providerAccountId: row.providerAccountId, field: "access_token" }),
        refresh_token: sealToken(fresh.refreshToken, { userId, providerAccountId: row.providerAccountId, field: "refresh_token" }),
        expires_at: toEpoch(fresh.expiresAt),
      },
    });
    if (written.count > 0) return { status: "ok", accessToken: fresh.accessToken };

    // 졌다 — 우리가 방금 받은 토큰은 이긴 쪽의 회전으로 이미 무효일 수 있다. 행을 믿는다.
    return (await afterRace(prisma, userId, now)) ?? { status: "reauthorize" };
  } catch (error) {
    // 조회·쓰기 자체가 죽은 경우다. `not-connected`로 접으면 장애가 "연결 안 됨"으로 읽혀
    // 사용자가 멀쩡한 연결을 다시 만든다 (POSTMORTEM 2026-09-03과 같은 축).
    logFailure("token-store", error);
    return { status: "unavailable" };
  }
}

/**
 * ⚠️ **`findFirst`다.** `Account`의 unique는 `@@id([provider, providerAccountId])` 하나뿐이라
 * `userId`로는 `findUnique`가 성립하지 않는다. User당 App 연결이 하나라는 것은 우리 정책이지
 * DB 제약이 아니다 (design §2.3).
 */
async function readAccount(prisma: PrismaClient, userId: string): Promise<AccountRow | null> {
  return prisma.account.findFirst({
    where: { userId, provider: PROVIDER },
    select: { providerAccountId: true, access_token: true, refresh_token: true, expires_at: true },
  });
}

/** 경합 뒤 한 번만 다시 읽는다. 쓸 수 있으면 그 토큰, 행이 사라졌으면 해제와 겹친 것이다. */
async function afterRace(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<UserToken | null> {
  const row = await readAccount(prisma, userId);
  if (row === null) return { status: "not-connected" };
  const plan = planTokenUse({
    expiresAt: toDate(row.expires_at),
    now,
    hasRefreshToken: row.refresh_token !== null,
  });
  // 여전히 못 쓰면 갱신을 되풀이하지 않는다 — 호출부가 사유를 정한다.
  return plan === "use" ? usable(row, userId) : null;
}

function usable(row: AccountRow, userId: string): UserToken {
  return row.access_token === null
    ? { status: "reauthorize" }
    : { status: "ok", accessToken: openToken(row.access_token, { userId, providerAccountId: row.providerAccountId, field: "access_token" })! };
}

/** `Account.expires_at`은 어댑터 계약대로 **초** 단위 epoch다. */
function toDate(seconds: number | null): Date | null {
  return seconds === null ? null : new Date(seconds * 1000);
}

function toEpoch(date: Date | null): number | null {
  return date === null ? null : Math.floor(date.getTime() / 1000);
}
