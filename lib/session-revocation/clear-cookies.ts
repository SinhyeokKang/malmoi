import "server-only";
import { cookies } from "next/headers";
import { expireBothVariants } from "@/lib/auth/roundtrip";
import { revocationCookie, revocationStateCookie } from "./policy";

/** 일반 로그인 진입점 둘 다 버려진 계정 확인 왕복을 무효로 만든다. */
export async function clearRevocationCookies() {
  expireBothVariants(await cookies(), [revocationCookie, revocationStateCookie]);
}
