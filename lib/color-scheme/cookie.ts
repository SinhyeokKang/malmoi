import "server-only";

import { cookies, headers } from "next/headers";

import { getPrisma } from "@/lib/db";
import { describeFailure } from "@/lib/failure";
import { COLOR_SCHEME_COOKIE, parseColorScheme, type ColorScheme } from "./scheme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * **기기 쿠키에 테마를 쓰는 자리 — 속성이 한 곳이다.** `setColorScheme`(Theme 카드)과 로그인 동기화가 같이 부른다.
 * http-only라 화면은 쿠키가 아니라 `<html data-theme>`을 읽는다. 프록시가 둘 이상이면 `https,http`처럼 목록으로 온다 — 앞이 클라이언트 쪽이다(`setUiLocale`과 같은 판정).
 */
export async function setColorSchemeCookie(colorScheme: ColorScheme): Promise<void> {
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  (await cookies()).set(COLOR_SCHEME_COOKIE, colorScheme, { httpOnly: true, sameSite: "lax", secure: proto === "https", path: "/", maxAge: ONE_YEAR });
}

/**
 * **로그인이 끝나면 계정의 테마를 이 기기 쿠키로 옮겨 적는다** — 그래야 로그아웃 뒤·다음 로그인 직전 화면이 계정 값과 같아 테마가 확 바뀌지 않는다.
 * 첫 로그인 그 순간의 한 번 전환은 원리상 남는다(쿠키가 아직 없다).
 *
 * ⚠️ 계정 값이 비었거나 지원 밖이면 **쿠키를 건드리지 않는다** — 기기에서 고른 값을 보존한다. 쿠키를 계정으로 올리는 방향은 없다(DB 쓰기 0, 병합 아님: 계정이 있으면 계정이 이긴다는 `resolveColorScheme`의 순서를 쿠키에 미리 반영할 뿐이다).
 * ⚠️ **절대 던지지 않는다** — 테마 때문에 로그인이 실패하면 안 된다.
 */
export async function syncColorSchemeCookieOnSignIn(userId: string): Promise<void> {
  try {
    const row = await getPrisma().user.findUnique({ where: { id: userId }, select: { colorScheme: true } });
    const colorScheme = parseColorScheme(row?.colorScheme);
    if (colorScheme === null) return;
    await setColorSchemeCookie(colorScheme);
  } catch (error) {
    console.error("Color scheme cookie sync failed.", { userId, cause: describeFailure(error) });
  }
}
