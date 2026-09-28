import { randomBytes } from "node:crypto";

import { hashInviteToken } from "@/lib/auth/invitation";

/**
 * MCP 개인 토큰 (mcp-connector design §1.2). **원문은 저장하지 않는다** — 발급 직후 한 번 보이고 `ApiToken.tokenHash`에 해시만 남는다.
 * 인증은 해시로 **행을 조회**하므로 비교 연산이 없고 타이밍 축도 없다(push 토큰·초대와 같은 판단).
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import하는 순수 모듈이다(경계는 `token-store.ts`).
 */

/** 사람 눈이 알아보게 하는 접두다 — secret scanning 파트너 등록은 비목표다. */
export const API_TOKEN_PREFIX = "mlm_";

export function generateApiToken(): string {
  return `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** 해시 규칙은 초대·push 토큰과 **같은 함수**다 — 갈리면 "해시 저장 규칙이 한 곳에 모인다"(PRODUCT §7.8)가 거짓이 된다. */
export function hashApiToken(raw: string): string {
  return hashInviteToken(raw);
}

/** scheme은 대소문자 무시(RFC 7235). 토큰 안의 공백은 거부한다 — 두 조각을 붙여 조회하지 않는다. */
export function parseBearer(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export type ApiTokenUse = { status: "ok" } | { status: "rejected" };

/**
 * ⚠️ **없음·폐기·만료가 한 갈래다** — 401 본문이 갈래를 말하지 않아야 하고(spec 조건 4), 갈래를 값으로 나누면 어느 껍데기가
 * 그것을 응답에 싣는다. 폐기·재발급은 행 삭제라 `row === null`로 온다.
 */
export function planApiTokenUse(input: { row: { expiresAt: Date } | null; now: Date }): ApiTokenUse {
  if (input.row === null) return { status: "rejected" };
  if (input.row.expiresAt.getTime() <= input.now.getTime()) return { status: "rejected" };
  return { status: "ok" };
}

/** `lastUsedAt` 갱신 간격. 호출마다 UPDATE하면 에이전트 루프가 행을 두드리고, 병렬 호출이 같은 행에 줄을 선다. */
const TOUCH_INTERVAL_MS = 60_000;

export function shouldTouch(lastUsedAt: Date | null, now: Date): boolean {
  if (lastUsedAt === null) return true;
  return now.getTime() - lastUsedAt.getTime() >= TOUCH_INTERVAL_MS;
}
