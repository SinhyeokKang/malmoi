import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { readSession } from "@/lib/auth/read-session";
import { COLOR_SCHEME_COOKIE, resolveColorScheme, type ColorScheme } from "@/lib/color-scheme/scheme";

/**
 * **요청의 화면 테마** — 계정(`User.colorScheme`) > 기기 쿠키 > light(`resolveColorScheme`). React `cache`로 렌더 요청 하나에 한 번 정한다.
 * `getUiLocale`(`lib/i18n/server.ts`)과 같은 형이다 — 세션 읽기는 `readSession`과 같은 요청 캐시를 지나 왕복이 늘지 않는다.
 *
 * ⚠️ 세션을 못 읽으면(`unavailable`) 거부가 아니라 쿠키로 넘어간다 — 화면 테마는 인가가 아니다.
 * ⚠️ **클라이언트 훅·provider를 만들지 않는다**(design §3.4) — 화면은 CSS가 `<html data-theme>` 하나로 읽는다. 서버 소비자는 루트 레이아웃과
 * Preferences의 Theme 카드 초기값뿐이다.
 */
export const getColorScheme = cache(async function getColorScheme(): Promise<ColorScheme> {
  const session = await readSession();
  const cookie = (await cookies()).get(COLOR_SCHEME_COOKIE)?.value;
  return resolveColorScheme({ account: session.status === "ok" ? session.colorScheme : null, cookie });
});
