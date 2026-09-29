import { describe, expect, it } from "vitest";

import { hashApiToken } from "@/lib/mcp/token";

import { planRevoke, revokeLookup } from "../revoke";

/**
 * `/oauth/revoke` 판정 (RFC 7009 · mcp-oauth design §6). access·refresh 어느 쪽이 와도 **그 연결**을 끊는다. 현재 issuer/resource와 제출한
 * `client_id`에 묶인 연결만 — `client_id`는 공개 식별자라 인증이 아니지만, 다른 클라이언트·다른 환경의 요청이 남의 연결을 끊지 못하게 한다.
 * 모르는 토큰·안 맞는 바인딩은 **조용히 무시**한다(RFC 7009 §2.2 — 응답은 같은 200).
 */
const endpoint = { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" };
const CLIENT = "https://claude.ai/oauth/claude-code-client-metadata";
const row = (over: Record<string, unknown> = {}) => ({ id: "c1", clientId: CLIENT, issuer: endpoint.issuer, resource: endpoint.resource, ...over });

describe("revokeLookup", () => {
  it("mlo_ → access 해시 · mlr_ → refresh 해시 · 그 밖은 조회하지 않는다", () => {
    expect(revokeLookup("mlo_x")).toEqual({ column: "accessTokenHash", hash: hashApiToken("mlo_x") });
    expect(revokeLookup("mlr_x")).toEqual({ column: "refreshTokenHash", hash: hashApiToken("mlr_x") });
    for (const token of ["mlm_x", "mlo_", "mlr_", "x"]) expect(revokeLookup(token)).toBeNull();
  });
});

describe("planRevoke", () => {
  it("바인딩이 맞으면 그 연결을 끊는다", () => {
    expect(planRevoke({ row: row(), clientId: CLIENT, endpoint })).toEqual({ status: "revoke", connectionId: "c1" });
  });

  it("행 없음 · 다른 client_id · 다른 issuer · 다른 resource → 무시", () => {
    expect(planRevoke({ row: null, clientId: CLIENT, endpoint })).toEqual({ status: "ignore" });
    expect(planRevoke({ row: row(), clientId: "https://chatgpt.com/oauth/codex/x/client.json", endpoint })).toEqual({ status: "ignore" });
    expect(planRevoke({ row: row({ issuer: "https://dev.mal-moi.com" }), clientId: CLIENT, endpoint })).toEqual({ status: "ignore" });
    expect(planRevoke({ row: row({ resource: "https://dev.mal-moi.com/api/mcp" }), clientId: CLIENT, endpoint })).toEqual({ status: "ignore" });
  });
});
