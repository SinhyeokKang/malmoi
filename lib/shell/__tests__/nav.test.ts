import { describe, expect, it } from "vitest";

import { activeProject, projectSections, type NavProject } from "../nav";

/**
 * 사이드바의 순수 판정 두 개.
 *
 * ⚠️ **pathname에서 뽑은 slug는 표시용이다** — 데이터 접근에 쓰지 않는다. 인가는 각 페이지의
 * `requireProjectAccess`가 하고, 여기서 하는 일은 "지금 어느 프로젝트를 보고 있나"를 **내 멤버십
 * 목록 안에서** 찾는 것뿐이다 (design §2). 목록에 없으면 컨텍스트가 없다.
 */

const memberships: NavProject[] = [
  { slug: "acme", name: "Acme", role: "OWNER" },
  { slug: "beta", name: "Beta", role: "EDITOR" },
];

describe("activeProject — pathname에서 프로젝트 컨텍스트", () => {
  it("프로젝트 라우트면 그 멤버십을 낸다", () => {
    expect(activeProject("/projects/acme/translations", memberships)).toEqual(memberships[0]);
    expect(activeProject("/projects/beta/settings", memberships)).toEqual(memberships[1]);
  });

  it("프로젝트 밖 라우트에는 컨텍스트가 없다 — 목록·생성 화면 (design §2)", () => {
    expect(activeProject("/projects", memberships)).toBeNull();
    expect(activeProject("/projects/new", memberships)).toBeNull();
  });

  it("`new`는 프로젝트 slug가 아니다 — 예약어라 온보딩이 그것을 거부한다", () => {
    expect(activeProject("/projects/new/anything", memberships)).toBeNull();
  });

  it("멤버가 아닌 slug면 컨텍스트가 없다 — 이름·역할을 지어내지 않는다", () => {
    expect(activeProject("/projects/ghost/translations", memberships)).toBeNull();
  });

  it("앱 밖 경로에도 컨텍스트가 없다", () => {
    expect(activeProject("/", memberships)).toBeNull();
    expect(activeProject("/invite/abc", memberships)).toBeNull();
  });

  it("끝 슬래시·쿼리가 붙어도 같은 답이다 — pathname은 라우터가 주지만 계약을 좁히지 않는다", () => {
    expect(activeProject("/projects/acme/translations/", memberships)).toEqual(memberships[0]);
  });
});

/**
 * ⚠️ **노출은 편의이고 방어가 아니다** (design §2). EDITOR가 URL로 직접 들어가면 페이지의
 * `requireProjectAccess`가 `not-found`를 낸다 — 여기서 항목을 숨기는 것은 없는 문을 안 보이게
 * 하는 것뿐이다. 그래서 판정을 `canPerform`이 하고 이 함수는 그것을 부르기만 한다.
 */
describe("projectSections — 역할이 항목을 정한다", () => {
  it("OWNER는 Translations와 Settings를 본다", () => {
    expect(projectSections("OWNER").map((s) => s.key)).toEqual(["translations", "settings"]);
  });

  it("EDITOR는 Translations만 본다", () => {
    expect(projectSections("EDITOR").map((s) => s.key)).toEqual(["translations"]);
  });

  it("모든 항목이 아이콘을 든다 — 접힌 레일에서 아이콘이 유일한 라벨이다 (DESIGN §6.8)", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      for (const section of projectSections(role)) {
        expect(section.icon, section.key).toBeDefined();
      }
    }
  });

  it("경로는 slug를 받아 만든다 — 화면이 문자열을 조립하지 않는다 (lib/routes.ts)", () => {
    const [translations] = projectSections("EDITOR");
    expect(translations?.href("acme")).toBe("/projects/acme/translations");
  });
});
