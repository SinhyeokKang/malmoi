import { describe, expect, it } from "vitest";

import { parseAuthorizeRequest } from "../authorize";

const RESOURCE = "https://mal-moi.com/api/mcp";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const valid = () => ({
  response_type: "code",
  client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  state: "st-1",
  resource: RESOURCE,
});

const parse = (params: Record<string, string | string[] | undefined>) => parseAuthorizeRequest(params, RESOURCE);

describe("parseAuthorizeRequest — 정상", () => {
  it("필수 파라미터가 다 있으면 검증된 요청을 낸다", () => {
    expect(parse(valid())).toEqual({
      ok: true,
      request: {
        clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        codeChallenge: CHALLENGE,
        state: "st-1",
        resource: RESOURCE,
      },
    });
  });

  it("state가 없으면 null이다 — PKCE가 CSRF를 대신 막는다", () => {
    const { state: _, ...rest } = valid();
    expect(parse(rest)).toMatchObject({ ok: true, request: { state: null } });
  });

  it("scope는 새 권한 어휘가 아니다 — 무엇이 와도 무시한다", () => {
    expect(parse({ ...valid(), scope: "admin everything" })).toMatchObject({ ok: true });
  });

  it("모르는 파라미터는 무시한다", () => {
    expect(parse({ ...valid(), prompt: "consent", nonce: "n" })).toMatchObject({ ok: true });
  });
});

describe("parseAuthorizeRequest — 되돌려 보낼 수 없는 오류(client·redirect_uri)", () => {
  it.each(["client_id", "redirect_uri"])("%s가 없으면 redirectable: false", key => {
    const params: Record<string, string> = valid();
    delete params[key];
    expect(parse(params)).toEqual({ ok: false, error: "invalid_request", redirectable: false });
  });

  it.each(["client_id", "redirect_uri"])("%s가 빈 문자열이면 redirectable: false", key => {
    expect(parse({ ...valid(), [key]: "" })).toEqual({ ok: false, error: "invalid_request", redirectable: false });
  });

  it.each(["client_id", "redirect_uri", "state"])("%s가 두 번 오면 redirectable: false (RFC 6749 §3.1)", key => {
    expect(parse({ ...valid(), [key]: ["a", "b"] })).toEqual({ ok: false, error: "invalid_request", redirectable: false });
  });

  it("redirect_uri가 절대 URL이 아니거나 fragment가 있으면 redirectable: false", () => {
    expect(parse({ ...valid(), redirect_uri: "/relative" })).toMatchObject({ ok: false, redirectable: false });
    expect(parse({ ...valid(), redirect_uri: "https://claude.ai/cb#frag" })).toMatchObject({ ok: false, redirectable: false });
  });

  it.each(["javascript:alert(1)//", "data:text/html,x", "http://evil.example/cb", "app://cb"])("redirect_uri %s는 redirectable: false", uri => {
    expect(parse({ ...valid(), redirect_uri: uri })).toEqual({ ok: false, error: "invalid_request", redirectable: false });
  });

  it("상한을 넘는 client_id·redirect_uri·state는 redirectable: false", () => {
    const long = "x".repeat(2049);
    expect(parse({ ...valid(), client_id: `https://a.example/${long}` })).toMatchObject({ ok: false, redirectable: false });
    expect(parse({ ...valid(), redirect_uri: `https://a.example/${long}` })).toMatchObject({ ok: false, redirectable: false });
    expect(parse({ ...valid(), state: long })).toMatchObject({ ok: false, redirectable: false });
  });
});

describe("parseAuthorizeRequest — 되돌려 보낼 수 있는 오류(등록 대조 뒤)", () => {
  const back = { redirectable: true, clientId: valid().client_id, redirectUri: valid().redirect_uri, state: "st-1" };

  it("response_type이 code가 아니면 unsupported_response_type", () => {
    expect(parse({ ...valid(), response_type: "token" })).toEqual({ ok: false, error: "unsupported_response_type", ...back });
    const { response_type: _, ...rest } = valid();
    expect(parse(rest)).toEqual({ ok: false, error: "invalid_request", ...back });
  });

  it("code_challenge가 없거나 형식이 틀리면 invalid_request", () => {
    const { code_challenge: _, ...rest } = valid();
    expect(parse(rest)).toEqual({ ok: false, error: "invalid_request", ...back });
    expect(parse({ ...valid(), code_challenge: "short" })).toEqual({ ok: false, error: "invalid_request", ...back });
  });

  it("code_challenge_method는 S256만 — 없음(=plain)·plain은 거부한다", () => {
    const { code_challenge_method: _, ...rest } = valid();
    expect(parse(rest)).toEqual({ ok: false, error: "invalid_request", ...back });
    expect(parse({ ...valid(), code_challenge_method: "plain" })).toEqual({ ok: false, error: "invalid_request", ...back });
    expect(parse({ ...valid(), code_challenge_method: "s256" })).toEqual({ ok: false, error: "invalid_request", ...back });
  });

  it("resource가 우리 MCP URL과 정확히 같지 않으면 invalid_target (RFC 8707)", () => {
    for (const resource of ["https://mal-moi.com/api/mcp/", "https://dev.mal-moi.com/api/mcp", "https://mal-moi.com", "https://evil.example/api/mcp"]) {
      expect(parse({ ...valid(), resource })).toEqual({ ok: false, error: "invalid_target", ...back });
    }
  });

  it("resource가 없으면 invalid_target — MCP 클라이언트는 반드시 보낸다", () => {
    const { resource: _, ...rest } = valid();
    expect(parse(rest)).toEqual({ ok: false, error: "invalid_target", ...back });
  });

  it.each(["response_type", "code_challenge", "code_challenge_method", "resource"])("%s가 두 번 오면 invalid_request", key => {
    expect(parse({ ...valid(), [key]: ["a", "b"] })).toEqual({ ok: false, error: "invalid_request", ...back });
  });

  it("state가 없던 요청의 오류는 state: null로 돌아간다", () => {
    const { state: _, ...rest } = valid();
    expect(parse({ ...rest, response_type: "token" })).toMatchObject({ ok: false, redirectable: true, state: null });
  });
});

describe("parseAuthorizeRequest — 남이 정한 키 (POSTMORTEM 2026-09-08 · 09-14)", () => {
  it("own property `__proto__` 키가 있어도 판정이 흔들리지 않는다", () => {
    // 리터럴 JSON이어야 own property가 생긴다 — `{ __proto__: … }` 객체 리터럴은 프로토타입을 바꿀 뿐이다.
    const params = JSON.parse(`{"__proto__":"x",${JSON.stringify(valid()).slice(1)}`) as Record<string, string>;
    expect(Object.hasOwn(params, "__proto__")).toBe(true);
    expect(parse(params)).toMatchObject({ ok: true });
  });

  it("프로토타입에서 찾아지는 값은 파라미터로 읽지 않는다", () => {
    const { client_id: _, ...rest } = valid();
    const params = Object.assign(Object.create({ client_id: "https://evil.example/meta" }) as Record<string, string>, rest);
    expect(parse(params)).toEqual({ ok: false, error: "invalid_request", redirectable: false });
  });

  it("빈 배열은 없음으로 본다", () => {
    expect(parse({ ...valid(), client_id: [] })).toEqual({ ok: false, error: "invalid_request", redirectable: false });
  });

  it("한 원소 배열은 값 하나다", () => {
    expect(parse({ ...valid(), state: ["st-1"] })).toMatchObject({ ok: true, request: { state: "st-1" } });
  });
});
