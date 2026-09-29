import { verifyPkce } from "./pkce";

/**
 * `/oauth/token`의 두 grant 판정 (mcp-oauth design §3 · §4.1). 조회·잠금·쓰기는 호출자의 몫이고, 여기는 **잠금 뒤 다시 읽은 행**을
 * 받아 결론만 낸다.
 *
 * ⚠️ 거부는 전부 `invalid_grant` 한 갈래다 — 만료·사용됨·불일치를 가르면 어느 껍데기가 그 차이를 응답에 싣는다(spec 조건 6).
 * DB 장애는 여기 오지 않는다 — 호출자가 `server_error`로 낸다(`invalid_grant`로 접으면 클라이언트가 연결을 버린다).
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

/** code 발급 시점의 스냅샷 — 요청 행을 다시 읽지 않는다(요청 TTL과 code 수명은 독립이다). */
export type CodeRow = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  issuer: string;
  resource: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type CodeExchange = { status: "ok" } | { status: "invalid_grant" };

export function planCodeExchange(input: {
  codeRow: CodeRow | null;
  now: Date;
  clientId: string | undefined;
  /** 생략은 받는다 — OAuth 2.1은 PKCE로 바인딩하고 `redirect_uri`를 요구하지 않는다. 오면 authorize 때 그 문자열과 같아야 한다. */
  redirectUri: string | undefined;
  /** 생략은 스냅샷 값을 쓴다(RFC 8707). */
  resource: string | undefined;
  verifier: string | undefined;
  expectedIssuer: string;
  expectedResource: string;
}): CodeExchange {
  const { codeRow: code } = input;
  const reject = { status: "invalid_grant" } as const;
  if (code === null || code.usedAt !== null || code.expiresAt.getTime() <= input.now.getTime()) return reject;
  // 발급 환경이 다르면 같은 DB를 보는 다른 origin의 code다(spec 조건 13).
  if (code.issuer !== input.expectedIssuer || code.resource !== input.expectedResource) return reject;
  if (input.clientId !== code.clientId) return reject;
  if (input.redirectUri !== undefined && input.redirectUri !== code.redirectUri) return reject;
  if (input.resource !== undefined && input.resource !== code.resource) return reject;
  if (input.verifier === undefined || !verifyPkce(input.verifier, code.codeChallenge)) return reject;
  return { status: "ok" };
}

/** 잠금 뒤 다시 읽은 연결 — 제시된 해시가 현재 것이면 그 연결, 사용 이력에 있으면 이력이 가리키는 연결. */
export type ConnectionRow = {
  id: string;
  clientId: string;
  issuer: string;
  resource: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

export type UsedTokenRow = { tokenHash: string; connectionId: string };

export type RefreshPlan =
  | { status: "rotate"; connectionId: string }
  /** 회전 전 토큰의 재사용 — 그 연결을 지운다. 외부 응답은 폐기 커밋 뒤 `invalid_grant`다(RFC 9700 §4.14.2). */
  | { status: "revoke-replayed-connection"; connectionId: string }
  | { status: "invalid_grant" };

export function planRefresh(input: {
  connectionRow: ConnectionRow | null;
  presentedHash: string;
  usedTokenRow: UsedTokenRow | null;
  now: Date;
  clientId: string | undefined;
  /** 생략은 기존 연결의 resource를 유지한다. 명시된 다른 값은 회전·폐기 없이 거부한다. */
  resource: string | undefined;
  expectedIssuer: string;
  expectedResource: string;
}): RefreshPlan {
  const { connectionRow: connection } = input;
  const reject = { status: "invalid_grant" } as const;
  if (connection === null) return reject;
  // ⚠️ 바인딩이 먼저다 — 다른 클라이언트·다른 환경의 요청이 남의 연결을 회전시키거나 폐기시키지 못한다.
  if (input.clientId !== connection.clientId) return reject;
  if (connection.issuer !== input.expectedIssuer || connection.resource !== input.expectedResource) return reject;
  if (input.resource !== undefined && input.resource !== connection.resource) return reject;

  if (input.presentedHash === connection.refreshTokenHash) {
    // 연결 수명은 동의 화면이 정했다 — refresh가 그것을 넘지 못한다(만료면 재동의).
    return connection.expiresAt.getTime() <= input.now.getTime() ? reject : { status: "rotate", connectionId: connection.id };
  }
  // 이력이 **이 연결**을 가리킬 때만 폐기한다 — 알 수 없는 해시만으로 연결을 지우지 않는다.
  const used = input.usedTokenRow;
  if (used !== null && used.tokenHash === input.presentedHash && used.connectionId === connection.id) {
    return { status: "revoke-replayed-connection", connectionId: connection.id };
  }
  return reject;
}
