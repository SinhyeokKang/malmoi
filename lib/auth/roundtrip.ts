/**
 * 인증 왕복 셋(`login-link` · `session-revocation` · `account-connect`)이 공유하는 **원시 판정** (audit #73).
 *
 * ⚠️ **흐름은 공유하지 않는다** — 셋은 목적(진행·중단·연결)과 격리가 달라 가로채기 본체는 각자 든다
 * (`lib/__tests__/oauth-callback-contract.test.ts`가 셋을 같은 입력으로 잰다). 여기 오는 것은 사본이 갈리면
 * 한쪽만 조용히 틀리는 조각뿐이다 — 정규식 셋, nonce 검사 둘, 쿠키 만료 루프 넷이 그랬다.
 */

const OAUTH_CALLBACK = /^\/api\/auth\/callback\/(github|google)$/;

/** Auth.js의 로그인 공급자 callback인가 — 세 가로채기가 이 경로에서만 판정한다. */
export function isOAuthCallback(pathname: string): boolean {
  return OAUTH_CALLBACK.test(pathname);
}

/** 왕복 증명 nonce는 canonical 32바이트 base64url이다 — 패딩·비정규 끝 비트를 거부한다. */
export function validNonce(raw: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(raw) && Buffer.from(raw, "base64url").toString("base64url") === raw;
}

type CookieSpec = (secure: boolean) => { name: string; options: object };

/**
 * 쿠키마다 **두 변형을 다** 지운다. 로컬(http)로 시작한 왕복이 secure 호스트에서 끝나거나 그 반대일 수 있어,
 * 현재 호스트의 변형만 지우면 stale state가 남는다(L5.2). http에서 보낸 `Secure` 삭제는 브라우저가 무시할 뿐이다.
 */
export function expireBothVariants(
  jar: { set(name: string, value: string, options: object): unknown },
  specs: readonly CookieSpec[],
): void {
  for (const spec of specs) {
    for (const secure of [false, true]) {
      const cookie = spec(secure);
      jar.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
    }
  }
}
