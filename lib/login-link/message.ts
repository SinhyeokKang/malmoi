import { m, pick } from "@/lib/i18n";

import type { LoginProvider } from "./policy";

/**
 * 병합 결과 → 문구. **사전 절이 둘이다**: 화면 문구는 `m.link`, 실패 사유는 `m.errors.link`.
 *
 * ⚠️ **인자가 `string`이다 — union이 아니다.** `?e=`는 주소창 값이고, 단언을 걸면 "모르는 값에
 * 폴백"이라는 계약이 검사에서 지워진다 (`inviteErrorMessage`와 같은 형).
 */
const LINK = m.errors.link;

export function linkErrorMessage(error: string): string {
  return error === "fallback" ? LINK.fallback : pick(LINK, error, LINK.fallback);
}

/** provider 표시 이름 — 화면이 문자열을 조립하면 같은 수단이 화면마다 다르게 읽힌다. */
export function providerLabel(provider: LoginProvider): string {
  return m.link.providers[provider];
}
