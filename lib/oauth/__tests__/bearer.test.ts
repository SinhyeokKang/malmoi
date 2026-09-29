import { describe, expect, it } from "vitest";

import { API_TOKEN_PREFIX } from "@/lib/mcp/token";

import { OAUTH_ACCESS_PREFIX, OAUTH_REFRESH_PREFIX, resolveBearerKind } from "../bearer";

/** DB를 두드리기 전에 접두로 가른다 — push 토큰·refresh를 잘못 붙인 설정이 조회를 일으키지 않는다(`resolveApiToken` 선례). */
describe("resolveBearerKind", () => {
  it("mlm_ → 개인 토큰", () => {
    expect(resolveBearerKind(`${API_TOKEN_PREFIX}abc`)).toBe("api-token");
  });

  it("mlo_ → OAuth access", () => {
    expect(OAUTH_ACCESS_PREFIX).toBe("mlo_");
    expect(resolveBearerKind("mlo_abc")).toBe("oauth");
  });

  it("refresh(mlr_)는 Bearer가 아니다", () => {
    expect(OAUTH_REFRESH_PREFIX).toBe("mlr_");
    expect(resolveBearerKind("mlr_abc")).toBeNull();
  });

  it("접두만 있고 본문이 없거나, 모르는 접두·대소문자 변형은 거부한다", () => {
    for (const token of ["mlm_", "mlo_", "", "MLO_abc", "mlp_abc", "abc"]) expect(resolveBearerKind(token)).toBeNull();
  });
});
