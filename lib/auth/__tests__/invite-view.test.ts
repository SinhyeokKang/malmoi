import { describe, expect, it } from "vitest";
import { planInviteView } from "../invite-view";

const now = new Date("2026-09-12T00:00:00Z");
const invitation = { email: "Person@example.com", expiresAt: new Date("2026-09-13"), acceptedAt: null };
const input = { session: "ok" as const, invitation, archived: false, viewerEmail: " person@EXAMPLE.com ", alreadyMember: false, queryError: undefined, now };

describe("초대 화면 판정", () => {
  it("세션 장애가 초대 부재보다 앞이다", () => {
    expect(planInviteView({ ...input, session: "unavailable", invitation: null })).toEqual({ kind: "blocked", notice: "unavailable", retry: true });
  });
  it("읽기 실패는 행 없음과 다르다", () => {
    expect(planInviteView({ ...input, invitation: undefined })).toEqual({ kind: "blocked", notice: "unavailable", retry: true });
    expect(planInviteView({ ...input, invitation: null })).toEqual({ kind: "blocked", notice: "not-found", retry: false });
  });
  it("수락된 초대는 만료보다 앞이고 재시도할 수 없다", () => {
    expect(planInviteView({ ...input, invitation: { ...invitation, acceptedAt: now, expiresAt: now } })).toEqual({ kind: "blocked", notice: "already-accepted", retry: false });
  });
  it("만료가 이메일 불일치와 비로그인보다 앞이다", () => {
    for (const session of ["ok", "none"] as const) {
      expect(planInviteView({ ...input, session, viewerEmail: "other@example.com", invitation: { ...invitation, expiresAt: now } })).toEqual({ kind: "blocked", notice: "expired", retry: false });
    }
  });
  /**
   * **보관 = 멈춤** (audit #79, B2 #26의 연장). 보관된 프로젝트에는 멤버가 새로 들지 않는다 — 수락 버튼을 세우면
   * 누른 뒤에야 거부를 본다. 초대는 소비되지 않으므로 복원 뒤 만료 전이면 같은 링크가 다시 산다.
   */
  it("보관된 프로젝트는 로그인·이메일 판정보다 먼저 막고, 만료·사용됨보다는 뒤다", () => {
    for (const session of ["ok", "none"] as const) {
      expect(planInviteView({ ...input, session, archived: true, viewerEmail: "other@example.com" })).toEqual({ kind: "blocked", notice: "archived", retry: false });
    }
    expect(planInviteView({ ...input, archived: true, invitation: { ...invitation, expiresAt: now } })).toEqual({ kind: "blocked", notice: "expired", retry: false });
    // 짝: 보관이 아니면 같은 입력이 수락으로 간다.
    expect(planInviteView({ ...input, archived: false })).toEqual({ kind: "accept", notice: null });
  });
  it("비로그인은 이메일과 멤버 여부를 판정하지 않는다", () => {
    expect(planInviteView({ ...input, session: "none", viewerEmail: null, alreadyMember: true })).toEqual({ kind: "sign-in", notice: null });
  });
  it("불일치가 이미 멤버보다 앞이다", () => {
    for (const viewerEmail of ["other@example.com", "", null]) {
      expect(planInviteView({ ...input, viewerEmail, alreadyMember: true })).toEqual({ kind: "wrong-account", notice: "email-mismatch" });
    }
  });
  it("일치하는 기존 멤버는 계정을 바꾼다", () => {
    expect(planInviteView({ ...input, alreadyMember: true })).toEqual({ kind: "wrong-account", notice: "already-member" });
  });
  it("이메일 정규화를 기존 수락 판정과 공유한다", () => {
    expect(planInviteView(input)).toEqual({ kind: "accept", notice: null });
  });
  it.each(["unauthorized", "unavailable", "not-found", "expired", "already-accepted", "email-mismatch", "already-member"])("알려진 queryError %s를 알림으로 보존한다", (queryError) => {
    for (const session of ["ok", "none"] as const) {
      expect(planInviteView({ ...input, session, queryError })).toEqual({ kind: session === "ok" ? "accept" : "sign-in", notice: queryError });
    }
  });
  it.each([undefined, "unknown", "constructor", "__proto__", "toString", "fallback"])("모르는 queryError %s는 알림이 없다", (queryError) => {
    expect(planInviteView({ ...input, queryError })).toEqual({ kind: "accept", notice: null });
  });
  it("렌더 판정이 오래된 쿼리보다 앞이다", () => {
    expect(planInviteView({ ...input, viewerEmail: null, queryError: "unavailable" })).toEqual({ kind: "wrong-account", notice: "email-mismatch" });
  });
});
