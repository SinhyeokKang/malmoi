/**
 * `/oauth/authorize` 화면 판정 (mcp-oauth 핸드오프 §10.1 · design §6.1). 순서가 방어다: **조회 장애 → 요청 검증 → 요청 상태 → 세션.**
 *
 * - 요청이 없거나(`missing`) 끝났으면(`expired`·`consumed`) 그 사실을 말하는 종료 화면이다 — 로그인 화면이나 `/projects`로 접지 않는다
 *   (POSTMORTEM 2026-09-10: 목적이 사라진 왕복이 일반 로그인이 됐다). 클라이언트로 돌아가는 버튼은 없다 — 요청을 못 믿으면 돌려보낼 곳도 못 믿는다.
 * - 장애는 없음으로 숨기지 않는다 — 재시도가 있는 별도 화면이다(`1r`). 살아 있는 요청에서 세션을 못 읽은 것도 여기다: 로그인 버튼을
 *   보이면 이미 로그인한 사람이 헛로그인한다(`/signin`과 같은 판단).
 * - `e`는 주소창 값이다 — 배열 `includes`로만 읽는다(프로토타입 키를 사유로 받지 않는다).
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

export type AuthorizeRequestState = "ok" | "error" | "invalid" | "missing" | "expired" | "consumed";
export type SignInNotice = "signed-out" | "switch";

export type AuthorizeView =
  | { kind: "ended"; reason: "invalid" | "not-found" | "expired" | "used" | "unavailable"; cta: "retry" | "projects" | null }
  | { kind: "sign-in"; notice: SignInNotice | null }
  | { kind: "consent" };

const NOTICES: readonly SignInNotice[] = ["signed-out", "switch"];
const ENDED = { invalid: "invalid", missing: "not-found", expired: "expired", consumed: "used" } as const;

export function planAuthorizeView(input: {
  request: AuthorizeRequestState;
  session: "ok" | "none" | "unavailable";
  e: string | undefined;
}): AuthorizeView {
  const { request, session } = input;
  if (request === "error") return { kind: "ended", reason: "unavailable", cta: "retry" };
  if (request !== "ok") return { kind: "ended", reason: ENDED[request], cta: session === "ok" ? "projects" : null };
  if (session === "unavailable") return { kind: "ended", reason: "unavailable", cta: "retry" };
  if (session === "none") {
    const e = input.e;
    return { kind: "sign-in", notice: e !== undefined && NOTICES.includes(e as SignInNotice) ? (e as SignInNotice) : null };
  }
  return { kind: "consent" };
}

/**
 * 행동 줄의 `You'll return to {host}.` — **검증된 콜백**의 host다(이름은 신원 보증이 아니라서, 돌아갈 곳을 사용자가 마지막으로 본다).
 * loopback은 포트까지 싣는다 — 같은 기기의 다른 리스너와 구별할 단서가 그것뿐이다.
 */
export function returnHost(redirectUri: string): string {
  return new URL(redirectUri).host;
}
