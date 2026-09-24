import "server-only";
import { cookies } from "next/headers";

import { expireBothVariants } from "@/lib/auth/roundtrip";

import { linkCookie, linkStateCookie } from "./policy";

/**
 * **일반 로그인 진입점 셋이 버려진 병합 왕복을 지운다** (ARCHITECTURE "계정 병합").
 *
 * ⚠️ **`clearRevocationCookies`와 쌍이다** — 두 가로채기의 intent 판정이 각자 쿠키 셋의 **OR**이라
 * 암호적 결합이 없다. 한쪽을 중단한 사용자가 곧바로 다른 쪽을 시작하면 남은 쿠키가 그 callback을
 * 먹고 Location을 엉뚱한 화면으로 덮는다 (POSTMORTEM 2026-09-10).
 */
export async function clearLinkCookies() {
  expireBothVariants(await cookies(), [linkCookie, linkStateCookie]);
}
