/**
 * GitHub App user 토큰의 사용·갱신 판정 (design §2.4). 저장·경합 처리는 껍데기(`ensureUserToken`)가
 * 하고 여기서는 갈래만 정한다 — refresh 토큰은 1회용(회전)이라 갱신 결과를 즉시 써야 한다.
 *
 * ⚠️ **`Account`에 `refresh_token_expires_in` 컬럼이 없다.** refresh 토큰 자체의 만료(6개월)와
 * 사용자가 GitHub에서 인가를 철회한 경우는 **이 함수가 볼 수 없다** — 껍데기가 갱신 호출 실패와
 * GET 401을 `reauthorize`로 접는다. 여기는 **가진 정보만으로** 판정한다.
 */

export type TokenUse = "use" | "refresh" | "reauthorize";

/** 판정과 실제 호출 사이의 왕복만큼 여유를 둔다 — 정각 기준이면 도착 시점에 죽은 토큰을 쓴다. */
const LEEWAY_MS = 60_000;

export function planTokenUse(input: {
  expiresAt: Date | null;
  now: Date;
  hasRefreshToken: boolean;
}): TokenUse {
  const { expiresAt, now, hasRefreshToken } = input;

  // 만료를 모르면(컬럼이 비었거나 App 설정에서 만료를 껐다) 써 본다 — 401이 reauthorize를 만든다.
  if (expiresAt === null) return "use";

  if (now.getTime() + LEEWAY_MS < expiresAt.getTime()) return "use";

  // 갱신할 수단이 없으면 재인가다. 이미 인가한 App이면 GitHub이 화면 없이 즉시 되돌려보낸다.
  return hasRefreshToken ? "refresh" : "reauthorize";
}
