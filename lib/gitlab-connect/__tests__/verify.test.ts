import { describe, expect, it } from "vitest";

import { GitLabHttpError } from "@/lib/gitlab/transport";

import { isTokenShaped, planGitLabUser, planPatVerification, tokenExpired } from "../verify";

/**
 * PAT 검증 판정 (gitlab-repositories design §2 "GitLab 연결" 2단계). 응답 모양은 2026-10-12 GitLab.com 실측(`/personal_access_tokens/self`).
 */
const SELF = {
  id: 1, name: "malmoi", description: "", scopes: ["api", "read_repository"], expires_at: "2026-11-11", user_id: 31337,
  active: true, revoked: false, created_at: "2026-10-12T00:00:00Z", last_used_at: null, last_used_ips: ["203.0.113.1"], granular: false,
};
const ok = (body: unknown) => ({ ok: true as const, body });
const failed = (status: number, scope = false) => ({ ok: false as const, error: new GitLabHttpError("/personal_access_tokens/self", status, scope) });

describe("planPatVerification", () => {
  it("레거시 PAT + `api` → 저장할 메타. 만료일은 그날 자정 UTC, 스코프는 정렬한다", () => {
    expect(planPatVerification(ok(SELF))).toEqual({ status: "ok", gitlabUserId: "31337", scopes: ["api", "read_repository"], expiresAt: new Date("2026-11-11T00:00:00.000Z") });
  });

  it("⚠️ `last_used_ips`는 결과에 실리지 않는다 — IP 목록은 저장하지 않는다", () => {
    expect(JSON.stringify(planPatVerification(ok(SELF)))).not.toContain("203.0.113.1");
  });

  it("만료일 없는 토큰도 받는다 — 인스턴스 설정에 따라 있을 수 있다", () => {
    expect(planPatVerification(ok({ ...SELF, expires_at: null }))).toMatchObject({ status: "ok", expiresAt: null });
  });

  it("401·비활성·철회는 token-invalid다 — 무효·만료·철회를 가르지 않는다", () => {
    expect(planPatVerification(failed(401))).toEqual({ status: "token-invalid" });
    expect(planPatVerification(ok({ ...SELF, active: false }))).toEqual({ status: "token-invalid" });
    expect(planPatVerification(ok({ ...SELF, revoked: true }))).toEqual({ status: "token-invalid" });
  });

  it("⚠️ fine-grained PAT는 거부한다(D13) — 스코프 판정보다 먼저다", () => {
    expect(planPatVerification(ok({ ...SELF, granular: true }))).toEqual({ status: "token-fine-grained" });
    expect(planPatVerification(ok({ ...SELF, granular: false, scopes: [], granular_scopes: [{ access: "read" }] }))).toEqual({ status: "token-fine-grained" });
  });

  it("`api`가 없으면 token-scope-missing이다 — `read_api`·`write_repository`로는 커밋·MR을 못 만든다", () => {
    for (const scopes of [["read_api"], ["read_repository", "write_repository"], []]) {
      expect(planPatVerification(ok({ ...SELF, scopes })), scopes.join()).toEqual({ status: "token-scope-missing" });
    }
  });

  it("⚠️ 네트워크·5xx·429는 unavailable이다 — 일시 장애를 '무효'로 접지 않는다", () => {
    for (const status of [429, 500, 502, 503]) expect(planPatVerification(failed(status)), String(status)).toEqual({ status: "unavailable" });
    expect(planPatVerification({ ok: false, error: new TypeError("fetch failed") })).toEqual({ status: "unavailable" });
  });

  it("모양이 다른 응답은 토큰 탓이 아니다 — unavailable", () => {
    expect(planPatVerification(ok({ message: "weird" }))).toEqual({ status: "unavailable" });
    expect(planPatVerification(ok({ ...SELF, expires_at: "next week" }))).toEqual({ status: "unavailable" });
  });
});

describe("planGitLabUser", () => {
  it("id가 `/self`의 user_id와 같을 때만 사용자명을 받는다", () => {
    expect(planGitLabUser(ok({ id: 31337, username: "ox501501", state: "active" }), "31337")).toEqual({ status: "ok", username: "ox501501" });
    expect(planGitLabUser(ok({ id: 1, username: "someone" }), "31337")).toEqual({ status: "unavailable" });
  });

  it("401은 token-invalid, 그 밖의 실패는 unavailable이다", () => {
    expect(planGitLabUser({ ok: false, error: new GitLabHttpError("/user", 401, false) }, "1")).toEqual({ status: "token-invalid" });
    expect(planGitLabUser({ ok: false, error: new GitLabHttpError("/user", 503, false) }, "1")).toEqual({ status: "unavailable" });
  });
});

describe("입력·만료", () => {
  it("PAT 입력은 공백·제어문자 없는 1~256자다", () => {
    expect(isTokenShaped("glpat-AbC_123-xyz")).toBe(true);
    for (const bad of ["", "glpat abc", "glpat\nabc", "x".repeat(257), "토큰"]) expect(isTokenShaped(bad), JSON.stringify(bad)).toBe(false);
  });

  it("만료일 자정이 지나면 만료다 — 호출 없이 안다", () => {
    const at = new Date("2026-11-11T00:00:00.000Z");
    expect(tokenExpired(at, new Date("2026-11-10T23:59:59.999Z"))).toBe(false);
    expect(tokenExpired(at, at)).toBe(true);
    expect(tokenExpired(null, new Date("2099-01-01"))).toBe(false);
  });
});
