import { describe, expect, it } from "vitest";

import { EXPIRES_SOON_DAYS, tokenExpiryState } from "../token-expiry";

/**
 * GitLab PAT의 만료 판정 (gitlab-repositories D11 · design §2 톤 표). **저장한 `expiresAt`만 본다** — 원격 호출 0이다.
 * GitLab의 `expires_at`은 날짜이고 그날 자정(UTC)에 만료된다 — 저장값이 그 시각이다.
 */
const NOW = new Date("2026-10-12T09:00:00.000Z");
const day = 86_400_000;

describe("tokenExpiryState", () => {
  it("경계는 14일이다", () => {
    expect(EXPIRES_SOON_DAYS).toBe(14);
  });

  it.each([
    ["만료일 없음", null, "valid"],
    ["15일 뒤", new Date(NOW.getTime() + 15 * day), "valid"],
    ["14일 뒤 정각 — 임박", new Date(NOW.getTime() + 14 * day), "expiresSoon"],
    ["내일", new Date(NOW.getTime() + day), "expiresSoon"],
    ["지금 — 이미 만료", NOW, "expired"],
    ["어제", new Date(NOW.getTime() - day), "expired"],
  ] as const)("%s → %s", (_name, expiresAt, state) => {
    expect(tokenExpiryState(expiresAt, NOW)).toBe(state);
  });
});
