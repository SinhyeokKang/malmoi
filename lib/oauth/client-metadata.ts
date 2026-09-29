import { isAllowedRedirectUri } from "./redirect";

/**
 * CIMD(Client ID Metadata Document) 검증 (mcp-oauth design §2 "T1 판정" — 두 CLI 모두 CIMD로 등록한다).
 * 가져오기·SSRF 방어(HTTPS만 · 사설 IP 거부 · 크기·시간 상한 · 리다이렉트 불추종)는 호출자의 몫이고, 여기는 **가져온 JSON**만 본다.
 *
 * ⚠️ 문서의 키는 전부 남이 정한 것이다 — `Object.hasOwn`으로만 읽는다(POSTMORTEM 2026-09-08).
 * ⚠️ `client_name`은 선택이다 — Codex 문서엔 없다(§0.1). 이름은 신원 보증이 아니므로 없으면 clientId URL을 보인다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

export type ClientMetadata = {
  clientId: string;
  /** 문서가 선언한 이름 그대로 — 없으면 `null`. 화면은 이름과 clientId를 함께 보인다(design §6.1). */
  clientName: string | null;
  /** 이름이 없으면 clientId URL. */
  displayName: string;
  redirectUris: string[];
};

export type ClientMetadataPlan = { ok: true; client: ClientMetadata } | { ok: false };

/**
 * HTTPS · 경로 있음 · fragment·userinfo·query 없음(CIMD 초안 SHOULD NOT) · **정규화해도 같은 문자열**. 마지막 조건이 점 세그먼트·대문자 호스트를 막는다 —
 * 정규화 전후가 다르면 가져온 문서의 `client_id`와 저장·표시하는 값이 갈린다.
 */
export function isClientIdUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && url.pathname !== "/" && url.hash === "" && !value.includes("#") && !value.includes("?")
    && url.username === "" && url.password === "" && url.href === value;
}

function own(doc: object, key: string): unknown {
  return Object.hasOwn(doc, key) ? (doc as Record<string, unknown>)[key] : undefined;
}

export function planClientMetadata(doc: unknown, clientIdUrl: string): ClientMetadataPlan {
  const reject = { ok: false } as const;
  if (!isClientIdUrl(clientIdUrl)) return reject;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return reject;
  if (own(doc, "client_id") !== clientIdUrl) return reject;

  const uris = own(doc, "redirect_uris");
  if (!Array.isArray(uris) || uris.length === 0) return reject;
  if (!uris.every((uri): uri is string => typeof uri === "string" && isAllowedRedirectUri(uri))) return reject;

  const name = own(doc, "client_name");
  const clientName = typeof name === "string" && name.trim() !== "" ? name : null;
  return { ok: true, client: { clientId: clientIdUrl, clientName, displayName: clientName ?? clientIdUrl, redirectUris: [...uris] } };
}
