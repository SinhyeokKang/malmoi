import { randomBytes } from "node:crypto";

import { hashInviteToken } from "@/lib/auth/invitation";

/**
 * 프로젝트별 push 토큰 (design §3.8 · PRODUCT §7.8). **원문은 저장하지 않는다** — 발급 시 한 번 보여주고 해시만
 * `Project.pushTokenHash`에 남긴다. 인증은 `sha256(원문)`으로 행을 **조회**하므로 비교 자체가 없다 —
 * `checkBearer`(`lib/push/auth.ts`)가 평문을 직접 비교하던 자리에 `timingSafeEqual`이 필요 없는 이유다.
 *
 * ⚠️ 해시 규칙은 초대 토큰과 **같은 함수**다. 두 곳이 갈리면 "해시 저장 규칙이 한 곳에 모인다"(PRODUCT §7.8)가
 * 거짓이 된다 — 그래서 sha256을 여기서 다시 쓰지 않고 그쪽을 부른다.
 */

/** 32바이트 난수 → base64url 43자. 반환만 한다 — 저장은 호출부가 `hashPushToken`으로 한 값만 한다. */
export function generatePushToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPushToken(raw: string): string {
  return hashInviteToken(raw);
}
