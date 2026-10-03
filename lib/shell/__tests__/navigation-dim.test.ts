import { describe, expect, it } from "vitest";

import { dimsNavigation, type LinkClick } from "../navigation-dim";

/**
 * **어느 클릭이 화면 dim을 켜나** — 다른 화면(pathname)으로 가는 같은 탭 이동만이다.
 *
 * ⚠️ 쿼리만 바뀌는 이동(키 선택·필터·검색·로그 상세)은 화면 안의 상태 변화이고 각자 pending 형을 든다(DESIGN §6.3·§6.68) —
 * 거기에 전면 dim이 겹치면 낙관값으로 먼저 선 선택이 흐려진다.
 */
const click = (over: Partial<LinkClick> = {}): LinkClick => ({
  plain: true,
  target: "",
  download: false,
  href: "https://mal-moi.com/projects/acme/members",
  current: "https://mal-moi.com/projects/acme",
  ...over,
});

describe("dimsNavigation", () => {
  it("같은 origin의 다른 pathname으로 가는 왼쪽 클릭은 dim을 켠다", () => {
    expect(dimsNavigation(click())).toBe(true);
    expect(dimsNavigation(click({ target: "_self" }))).toBe(true);
  });

  it("쿼리·hash만 바뀌면 켜지 않는다", () => {
    expect(dimsNavigation(click({ href: "https://mal-moi.com/projects/acme?event=e1" }))).toBe(false);
    expect(dimsNavigation(click({ href: "https://mal-moi.com/projects/acme#logs" }))).toBe(false);
    expect(dimsNavigation(click({ href: "https://mal-moi.com/projects/acme" }))).toBe(false);
  });

  it("새 탭·다운로드·보조 버튼은 이 문서를 떠나지 않는다", () => {
    expect(dimsNavigation(click({ plain: false }))).toBe(false);
    expect(dimsNavigation(click({ target: "_blank" }))).toBe(false);
    expect(dimsNavigation(click({ download: true }))).toBe(false);
  });

  it("다른 origin·비 http 주소는 켜지 않는다 — 이 앱의 이동이 아니다", () => {
    expect(dimsNavigation(click({ href: "https://github.com/apps/malmoi-sync" }))).toBe(false);
    expect(dimsNavigation(click({ href: "mailto:someone@example.com" }))).toBe(false);
  });

  it("해석할 수 없는 주소는 켜지 않는다", () => {
    expect(dimsNavigation(click({ href: "http://[" }))).toBe(false);
  });
});
