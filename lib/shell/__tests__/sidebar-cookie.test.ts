import { describe, expect, it } from "vitest";

import { SIDEBAR_COLLAPSED_COOKIE, parseSidebarCollapsed, sidebarCollapsedCookie } from "../sidebar-cookie";

/**
 * **LNB 접힘 여부의 기기 쿠키** — 서버 렌더가 읽어 첫 페인트부터 접힌 셸을 그리고, 클라이언트가 토글·드래그 때 쓴다.
 * 폭(200~320)은 저장하지 않는다(2026-10-07 사용자 — 여부만).
 */
describe("sidebar-cookie", () => {
  it("이름이 기기 쿠키 접두를 따른다", () => {
    expect(SIDEBAR_COLLAPSED_COOKIE).toBe("malmoi-sidebar-collapsed");
  });

  it("`1`만 접힘이다 — 그 밖의 값·없음은 기본(펼침)으로 떨어진다", () => {
    expect(parseSidebarCollapsed("1")).toBe(true);
    for (const raw of ["0", "", "true", "yes", " 1", "__proto__", undefined, null, 1, true]) {
      expect(parseSidebarCollapsed(raw), String(raw)).toBe(false);
    }
  });

  it("쿠키 한 줄 — 경로 전체 · 1년 · Lax이고 http-only가 아니다(클라이언트가 쓴다)", () => {
    expect(sidebarCollapsedCookie(true, false)).toBe("malmoi-sidebar-collapsed=1; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(sidebarCollapsedCookie(false, false)).toBe("malmoi-sidebar-collapsed=0; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(sidebarCollapsedCookie(true, false)).not.toMatch(/HttpOnly/i);
  });

  it("https에서는 Secure를 단다", () => {
    expect(sidebarCollapsedCookie(true, true)).toBe("malmoi-sidebar-collapsed=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax");
  });

  it("쓴 값을 다시 읽으면 같은 상태다", () => {
    for (const collapsed of [true, false]) {
      const value = sidebarCollapsedCookie(collapsed, false).split(";")[0]?.split("=")[1];
      expect(parseSidebarCollapsed(value)).toBe(collapsed);
    }
  });
});
