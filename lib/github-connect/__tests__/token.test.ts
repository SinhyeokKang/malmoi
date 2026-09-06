import { describe, expect, it } from "vitest";

import { planTokenUse, refreshFailure } from "../token";

/**
 * GitHub App user 토큰의 사용·갱신 판정 (design §2.4·§4). 토큰은 기본 8시간이고 refresh 토큰은
 * 1회용(회전)이다 — 그 저장·경합 처리는 껍데기(`ensureUserToken`)가 하고 여기서는 갈래만 정한다.
 *
 * ⚠️ **만료 60초 전을 이미 만료로 본다.** 판정과 실제 호출 사이에 왕복이 있어, 정확히 만료 시각을
 * 기준으로 하면 "판정할 땐 살아 있었는데 도착하니 죽은" 토큰을 쓴다.
 *
 * ⚠️ **`reauthorize`는 refresh 토큰이 없을 때만이 아니다.** 갱신 호출이 실패하거나 GET이 401이면
 * 껍데기가 `reauthorize`로 접는다 — `Account`에 `refresh_token_expires_in` 컬럼이 없어 refresh 만료를
 * 여기서 볼 수 없기 때문이다. 이 함수는 **가진 정보만으로** 판정한다.
 */

const NOW = new Date("2026-09-06T00:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("planTokenUse — 아직 쓸 수 있으면 use", () => {
  it("만료가 한참 남았으면 use다", () => {
    expect(planTokenUse({ expiresAt: at(3600), now: NOW, hasRefreshToken: true })).toBe("use");
  });

  it("61초 남았으면 아직 use다 — 여유는 60초다", () => {
    expect(planTokenUse({ expiresAt: at(61), now: NOW, hasRefreshToken: true })).toBe("use");
  });

  it("refresh 토큰이 없어도 만료 전이면 use다 — 미리 재인가로 튕기지 않는다", () => {
    expect(planTokenUse({ expiresAt: at(3600), now: NOW, hasRefreshToken: false })).toBe("use");
  });

  it("expiresAt이 null이면 use다 — 만료를 모르면 써 본다 (401이 reauthorize를 만든다)", () => {
    expect(planTokenUse({ expiresAt: null, now: NOW, hasRefreshToken: false })).toBe("use");
  });
});

describe("planTokenUse — 만료가 임박·경과하면 refresh", () => {
  it("정확히 60초 남으면 refresh다 — 경계는 만료 쪽에 넣는다", () => {
    expect(planTokenUse({ expiresAt: at(60), now: NOW, hasRefreshToken: true })).toBe("refresh");
  });

  it("이미 만료됐고 refresh 토큰이 있으면 refresh다", () => {
    expect(planTokenUse({ expiresAt: at(-1), now: NOW, hasRefreshToken: true })).toBe("refresh");
  });

  it("만료 시각 정각도 refresh다", () => {
    expect(planTokenUse({ expiresAt: NOW, now: NOW, hasRefreshToken: true })).toBe("refresh");
  });
});

describe("planTokenUse — 갱신할 수단이 없으면 reauthorize", () => {
  it("만료됐고 refresh 토큰이 없으면 reauthorize다", () => {
    expect(planTokenUse({ expiresAt: at(-1), now: NOW, hasRefreshToken: false })).toBe("reauthorize");
  });

  it("만료 임박 + refresh 토큰 없음도 reauthorize다", () => {
    expect(planTokenUse({ expiresAt: at(30), now: NOW, hasRefreshToken: false })).toBe("reauthorize");
  });
});

describe("refreshFailure — 갱신 실패를 거부와 장애로 가른다", () => {
  /**
   * ⚠️ `Account`에 `refresh_token_expires_in` 컬럼이 없어(design §5) refresh 만료를 미리 볼 수 없다 —
   * **갱신 호출의 실패가 유일한 신호**다. 그 신호를 한 갈래로 접으면 일시 장애가 "다시 인가하세요"로
   * 위장돼 사용자가 멀쩡한 연결을 지우고 다시 만든다 (POSTMORTEM 2026-09-03·2026-09-06과 같은 축).
   */
  it("4xx는 reauthorize다 — refresh 토큰이 만료됐거나 인가가 철회됐다", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(refreshFailure(status)).toBe("reauthorize");
    }
  });

  it("5xx·429는 unavailable이다 — 재시도가 유효한 실패다", () => {
    for (const status of [429, 500, 502, 503]) {
      expect(refreshFailure(status)).toBe("unavailable");
    }
  });

  it("status를 모르면(네트워크) unavailable이다 — 부재를 거부로 읽지 않는다", () => {
    expect(refreshFailure(undefined)).toBe("unavailable");
  });
});
