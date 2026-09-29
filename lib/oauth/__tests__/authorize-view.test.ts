import { describe, expect, it } from "vitest";

import { planAuthorizeView, returnHost } from "../authorize-view";

/**
 * `/oauth/authorize` 화면 판정 순서 (mcp-oauth 핸드오프 §10.1 · design §6.1 · POSTMORTEM 2026-09-10). 조회 장애 → 요청 검증 → 요청 상태 → 세션.
 * 요청이 없거나 끝났으면 **명시적으로 끝낸다** — 로그인 화면이나 `/projects`로 접지 않는다. 장애는 없음으로 숨기지 않고 재시도를 준다.
 */
describe("planAuthorizeView", () => {
  it("요청 조회 장애는 재시도가 있는 종료 화면이다 — 세션과 무관하다", () => {
    for (const session of ["ok", "none", "unavailable"] as const) {
      expect(planAuthorizeView({ request: "error", session, e: undefined })).toEqual({ kind: "ended", reason: "unavailable", cta: "retry" });
    }
  });

  it("검증 실패 · 없음 · 만료 · 처리됨은 종료 화면이다 — 로그인 상태면 내 프로젝트로 가는 출구, 아니면 출구 없음", () => {
    const cases = [["invalid", "invalid"], ["missing", "not-found"], ["expired", "expired"], ["consumed", "used"]] as const;
    for (const [request, reason] of cases) {
      expect(planAuthorizeView({ request, session: "ok", e: undefined })).toEqual({ kind: "ended", reason, cta: "projects" });
      expect(planAuthorizeView({ request, session: "none", e: undefined })).toEqual({ kind: "ended", reason, cta: null });
      expect(planAuthorizeView({ request, session: "unavailable", e: undefined })).toEqual({ kind: "ended", reason, cta: null });
    }
  });

  it("살아 있는 요청에서 세션을 못 읽으면 조회 장애 화면이다 — 로그인 버튼을 보이면 헛로그인한다", () => {
    expect(planAuthorizeView({ request: "ok", session: "unavailable", e: undefined })).toEqual({ kind: "ended", reason: "unavailable", cta: "retry" });
  });

  it("무세션 → 이 화면의 로그인 · 동의 중 세션이 끝났으면 경고 · Not you? 뒤면 첫 공급자에 포커스", () => {
    expect(planAuthorizeView({ request: "ok", session: "none", e: undefined })).toEqual({ kind: "sign-in", notice: null });
    expect(planAuthorizeView({ request: "ok", session: "none", e: "signed-out" })).toEqual({ kind: "sign-in", notice: "signed-out" });
    expect(planAuthorizeView({ request: "ok", session: "none", e: "switch" })).toEqual({ kind: "sign-in", notice: "switch" });
    // 모르는 사유 · 프로토타입 키는 사유가 아니다.
    for (const e of ["toString", "__proto__", "other"]) expect(planAuthorizeView({ request: "ok", session: "none", e })).toEqual({ kind: "sign-in", notice: null });
  });

  it("세션 있음 → 동의 — 사유 쿼리는 무시한다", () => {
    expect(planAuthorizeView({ request: "ok", session: "ok", e: "signed-out" })).toEqual({ kind: "consent" });
  });
});

describe("returnHost — 행동 줄의 `You'll return to …`", () => {
  it("검증된 콜백의 host다 — loopback은 포트까지", () => {
    expect(returnHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(returnHost("http://localhost:33418/callback")).toBe("localhost:33418");
    expect(returnHost("http://127.0.0.1:1455/callback/abc")).toBe("127.0.0.1:1455");
  });
});
