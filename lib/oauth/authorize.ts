import { isCodeChallenge } from "./pkce";
import { isAllowedRedirectUri } from "./redirect";

/**
 * `/oauth/authorize` 쿼리 판정 (mcp-oauth design §3). **등록 대조는 하지 않는다** — `client_id`·`redirect_uri`의 모양만 보고,
 * 등록된 콜백인지는 호출자가 클라이언트 메타데이터로 `planRedirectUri`를 돌려 확인한다.
 *
 * `redirectable: true`는 "등록 대조를 통과하면 그 콜백으로 오류를 돌려보낼 수 있다"는 뜻이다. `client_id`·`redirect_uri`가
 * 틀린 오류는 되돌려 보낼 곳을 믿을 수 없으므로 화면에 그린다(open redirect).
 *
 * ⚠️ `searchParams`는 남이 정한 키다 — `Object.hasOwn`으로만 읽는다(POSTMORTEM 2026-09-08).
 * ⚠️ `scope`는 읽지 않는다 — 권한은 동의 화면이 기존 grant 어휘로 고른다(spec 비목표 "새 권한 어휘").
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  /** 없으면 `null` — 콜백에 `state`를 싣지 않는다. PKCE가 CSRF를 막는다. */
  state: string | null;
  resource: string;
};

export type AuthorizeError = "invalid_request" | "unsupported_response_type" | "invalid_target";

export type AuthorizeParse =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; error: AuthorizeError; redirectable: false }
  | { ok: false; error: AuthorizeError; redirectable: true; clientId: string; redirectUri: string; state: string | null };

/** 요청 행에 그대로 저장되는 값들의 상한 — 무인증 공개 진입점이다. */
const MAX_LENGTH = 2048;

type Params = Record<string, string | string[] | undefined>;

/** 없음 · 하나 · 중복. 중복은 RFC 6749 §3.1("MUST NOT be included more than once")로 거부한다. */
function read(params: Params, key: string): { kind: "none" } | { kind: "one"; value: string } | { kind: "many" } {
  if (!Object.hasOwn(params, key)) return { kind: "none" };
  const raw = params[key];
  if (raw === undefined) return { kind: "none" };
  if (typeof raw === "string") return { kind: "one", value: raw };
  if (raw.length === 0) return { kind: "none" };
  if (raw.length > 1) return { kind: "many" };
  return { kind: "one", value: raw[0] ?? "" };
}

export function parseAuthorizeRequest(params: Params, expectedResource: string): AuthorizeParse {
  const fatal = { ok: false, error: "invalid_request", redirectable: false } as const;
  const clientId = read(params, "client_id");
  const redirectUri = read(params, "redirect_uri");
  const state = read(params, "state");
  if (clientId.kind !== "one" || clientId.value === "" || clientId.value.length > MAX_LENGTH) return fatal;
  if (redirectUri.kind !== "one" || redirectUri.value.length > MAX_LENGTH || !isAllowedRedirectUri(redirectUri.value)) return fatal;
  // 중복 state는 어느 쪽을 돌려줄지 정할 수 없다 — 되돌려 보내지 않는다.
  if (state.kind === "many" || (state.kind === "one" && state.value.length > MAX_LENGTH)) return fatal;

  const back = { clientId: clientId.value, redirectUri: redirectUri.value, state: state.kind === "one" ? state.value : null };
  const fail = (error: AuthorizeError) => ({ ok: false, error, redirectable: true, ...back }) as const;

  const responseType = read(params, "response_type");
  if (responseType.kind !== "one") return fail("invalid_request");
  if (responseType.value !== "code") return fail("unsupported_response_type");

  const challenge = read(params, "code_challenge");
  const method = read(params, "code_challenge_method");
  if (challenge.kind !== "one" || !isCodeChallenge(challenge.value)) return fail("invalid_request");
  // 생략은 `plain`이다(RFC 7636 §4.3) — S256만 받는다.
  if (method.kind !== "one" || method.value !== "S256") return fail("invalid_request");

  const resource = read(params, "resource");
  if (resource.kind === "many") return fail("invalid_request");
  // 두 CLI는 authorize·교환·refresh 전부에 resource를 보낸다(design §0.1). claude.ai는 미측정이다 — 생략이 관측되면 여기부터 다시 본다.
  // 없거나 다른 환경의 것이면 이 AS가 발급할 대상이 아니다.
  if (resource.kind !== "one" || resource.value !== expectedResource) return fail("invalid_target");

  return { ok: true, request: { ...back, codeChallenge: challenge.value, resource: resource.value } };
}
