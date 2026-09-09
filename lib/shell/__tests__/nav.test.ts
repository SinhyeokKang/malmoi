import { describe, expect, it } from "vitest";

import type { Role } from "@/lib/auth/permission";

import { activeProject, navZones, projectSections, type NavProject } from "../nav";

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
  /**
   * ⚠️ **순서가 SAAS §7.7의 라우트 표 순서다** — Locales가 Translations 다음이다. Home·Logs는 아직
   * 라우트가 없어 빠져 있다(6b-6·7단계). **항목은 자기 라우트와 같은 사이클에 온다** (6b-4 판정).
   */
  it("OWNER는 다섯을 본다 — Home이 6b-6에서 붙었다", () => {
    expect(projectSections("OWNER").map((s) => s.key)).toEqual([
      "home",
      "translations",
      "locales",
      "members",
      "settings",
    ]);
  });

  it("EDITOR는 Settings만 못 본다 — Home·Locales는 전원이 본다", () => {
    expect(projectSections("EDITOR").map((s) => s.key)).toEqual([
      "home",
      "translations",
      "locales",
      "members",
    ]);
  });

  /**
   * ⚠️ **Home은 접두로 재면 항상 활성이다** (6b-4 code-review ⚪2가 예고한 자리). `/projects/acme`는
   * 그 프로젝트의 **모든** 하위 라우트의 접두라, 번역 화면에 있어도 Home이 선택돼 보인다 — 어디에
   * 있는지를 사이드바가 거짓으로 말하는 것이고, 그것이 구역에 이름을 붙인 목적(추론이 아니라 표시)을
   * 무너뜨린다. **규칙은 축이 아니라 라우트 모양에 붙는다**: 하위 경로가 있는 항목만 접두다.
   */
  it("Home만 정확히 일치다 — 나머지 프로젝트 항목은 하위 경로가 있어 접두다", () => {
    const byKey = new Map(projectSections("OWNER").map((s) => [s.key, s.exact]));
    expect(byKey.get("home")).toBe(true);
    for (const key of ["translations", "locales", "members", "settings"]) {
      expect(byKey.get(key), key).toBe(false);
    }
  });

  /**
   * ⚠️ **Locales의 게이트도 `translation:write`다** (6b-2 관용구). 그 화면은 orphaned 로케일이 왜
   * 그렇게 됐는지를 말하는 유일한 자리이고, 번역자가 열이 사라진 이유를 알 길이 그것뿐이다 —
   * `project:settings` 뒤에 두면 EDITOR가 아예 못 들어온다.
   */
  it("Locales는 두 역할에 다 있다 — 컨트롤만 갈린다", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      expect(projectSections(role).map((s) => s.key), role).toContain("locales");
    }
  });

  /**
   * ⚠️ **Members는 `member:manage` 뒤가 아니다** (design §3.9 검수 (b)). EDITOR도 목록을 본다 —
   * user-stories §5의 "EDITOR는 목록만 본다"와 §0의 "OWNER만"이 모순이었고 전자가 맞다. 컨트롤만
   * 역할로 감추고 Action이 `member:manage`로 거부한다.
   */
  it("Members는 두 역할에 다 있다 — 목록은 전원이 본다, 컨트롤만 갈린다", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      expect(projectSections(role).map((s) => s.key), role).toContain("members");
    }
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

/**
 * **축이 둘이고 구역이 그것을 드러낸다** (SAAS §7.7 — IA 확정 2026-09-09). 지금까지 사이드바는
 * 프로젝트 컨텍스트를 `usePathname`으로 **추론**했고, 사용자 축(목록·생성·계정)은 구분 선 아래
 * 이름 없는 묶음이었다 — 구역에 이름이 붙으면 "내가 어느 스코프에 있나"가 추론이 아니라 표시가 된다.
 *
 * ⚠️ **순서가 문서 순서다** — 사용자 축이 먼저다. 그 순서가 곧 "프로젝트는 내 일 안의 하나"라는
 * 정보구조이고, 뒤집으면 프로젝트가 없는 사용자에게 빈 자리가 위에 남는다.
 */
describe("navZones — 사용자 축과 프로젝트 축 (SAAS §7.7)", () => {
  const project = (role: Role): NavProject => ({ slug: "acme", name: "Acme", role });

  it("프로젝트 컨텍스트가 있으면 구역이 둘이고 사용자 축이 먼저다", () => {
    expect(navZones(project("OWNER")).map((z) => z.key)).toEqual(["work", "project"]);
  });

  it("컨텍스트가 없으면 사용자 축 하나다 — 목록·생성·계정 화면에서 프로젝트 항목을 지어내지 않는다", () => {
    expect(navZones(null).map((z) => z.key)).toEqual(["work"]);
  });

  it("사용자 축은 목록·생성·계정 셋이다 — `/account`가 여기 산다 (6b-4)", () => {
    expect(navZones(null)[0]?.items.map((i) => i.href)).toEqual(["/projects", "/projects/new", "/account"]);
  });

  it("프로젝트 구역의 라벨은 프로젝트 이름이다 — 어느 스코프인지 이름으로 말한다", () => {
    expect(navZones({ slug: "beta", name: "Beta", role: "EDITOR" })[1]?.label).toBe("Beta");
  });

  it("프로젝트 구역은 `projectSections`를 그대로 든다 — 권한 판정이 두 벌이 되지 않는다", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      expect(navZones(project(role))[1]?.items.map((i) => i.key), role).toEqual(
        projectSections(role).map((s) => s.key),
      );
    }
  });

  /**
   * ⚠️ **6b-2 관용구다** — EDITOR도 Members·Translations를 본다. 여기서 빠지는 것은 `project:settings`
   * 하나이고, 그 하나가 늘어나면(Locales·Home·Logs가 6b-5·6b-6·7단계에 온다) 이 케이스가 먼저 답한다.
   */
  it("EDITOR에게 빠지는 항목은 Settings 하나다 — 나머지는 전원이 본다", () => {
    const keys = (role: Role): string[] => navZones(project(role)).flatMap((z) => z.items.map((i) => i.key));
    expect(keys("OWNER").filter((k) => !keys("EDITOR").includes(k))).toEqual(["settings"]);
  });

  it("사용자 축은 전부 정확히 일치다 — `/projects`가 `/projects/new`의 접두다", () => {
    const work = navZones(null)[0];
    expect(work?.items.length).toBeGreaterThan(0);
    for (const item of work?.items ?? []) expect(item.exact, item.key).toBe(true);
  });

  it("항목마다 아이콘과 **완성된** href가 있다 — 접힌 레일에서 아이콘이 유일한 라벨이다 (DESIGN §6.8)", () => {
    for (const zone of navZones(project("OWNER"))) {
      expect(zone.items.length, zone.key).toBeGreaterThan(0);
      for (const item of zone.items) {
        expect(item.icon, item.key).toBeDefined();
        expect(item.label, item.key).not.toBe("");
        // 화면이 문자열을 조립하지 않는다 — slug를 아는 것은 이 함수다 (`lib/routes.ts`).
        expect(item.href, item.key).toMatch(/^\//);
      }
    }
  });
});
