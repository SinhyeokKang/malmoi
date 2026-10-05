const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * **기기 쿠키(화면 테마 `malmoi-color-scheme` · 화면 언어 `malmoi-ui-locale`) 속성의 유일한 출처다** — `setColorScheme`·`setUiLocale` Action(`cookies().set`)과
 * 로그인 동기화(응답 헤더에 직렬화해 붙인다)가 같이 쓴다. 잎이다(import 0) — 서버 전용이 아니라 래퍼 테스트가 부수효과 없이 읽는다.
 * http-only라 화면은 쿠키가 아니라 `<html data-theme>`·provider가 받은 값을 읽는다.
 */
export function deviceCookieSpec(name: string, value: string, secure: boolean) {
  return { name, value, options: { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: ONE_YEAR } } as const;
}

/** 프록시가 둘 이상이면 `https,http`처럼 목록으로 온다 — 앞이 클라이언트 쪽이다. */
export function isSecureForwardedProto(header: string | null): boolean {
  return header?.split(",")[0]?.trim().toLowerCase() === "https";
}

/**
 * `Set-Cookie` 한 줄. 값은 지원 집합(`COLOR_SCHEMES`·`UI_LOCALES`)의 낱말이라 이스케이프가 필요 없다 — 호출부가 parse를 지난 값만 넘긴다.
 * ⚠️ `cookies().set`을 Route Handler에서 쓰지 않으려고 있다 — 그 경로는 응답의 Set-Cookie 전체를 재직렬화한다(ARCHITECTURE §6.357).
 */
export function serializeCookieSpec({ name, value, options }: ReturnType<typeof deviceCookieSpec>): string {
  return [`${name}=${value}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`, "HttpOnly", ...(options.secure ? ["Secure"] : []), "SameSite=Lax"].join("; ");
}
