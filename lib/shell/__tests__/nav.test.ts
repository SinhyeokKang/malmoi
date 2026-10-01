import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CircleHelp, Compass } from "lucide-react";

import { McpIcon } from "@/components/signin/brand-icons";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { activeProject, navFooterItems, navZones, projectSections, type NavProject } from "../nav";

/**
 * 사이드바의 순수 판정 두 개.
 *
 * ⚠️ **pathname에서 뽑은 slug는 표시용이다** — 데이터 접근에 쓰지 않는다. 인가는 각 페이지의
 * `requireProjectAccess`가 하고, 여기서 하는 일은 "지금 어느 프로젝트를 보고 있나"를 **내 멤버십
 * 목록 안에서** 찾는 것뿐이다 (ARCHITECTURE §6.1). 목록에 없으면 컨텍스트가 없다.
 */

const memberships: NavProject[] = [
  { slug: "acme", name: "Acme", role: "OWNER", archived: false },
  { slug: "beta", name: "Beta", role: "EDITOR", archived: false },
];

/**
 * **사이드바 Translations는 기본 표면의 주소를 직접 가리킨다** (audit-ux #4). 옛 `/translations`는 누를 때마다
 * 서버 redirect 한 번(인증 → 접근 → `defaultSurface` 조회 → redirect)을 더 거치고, 그 두 세그먼트 모두 경계가 없어
 * prefetch도 무의미했다. 옛 라우트는 외부 링크 호환용으로 남는다 — 기본 표면을 모를 때만 거기로 간다.
 */
describe("Translations 링크 — 기본 표면으로 직접", () => {
  const withDefault: NavProject[] = [{ slug: "acme", name: "Acme", role: "OWNER", archived: false, defaultSurfaceSlug: "app" }];
  const translations = (pathname: string, list: NavProject[] = withDefault) =>
    navZones(activeProject(pathname, list), { userName: "Shin", projectCount: 1 })[1]!.items.find((item) => item.key === "translations")!.href;

  it("Home에서 기본 표면의 편집 주소다 — redirect를 거치지 않는다", () => {
    expect(translations("/projects/acme")).toBe("/projects/acme/surfaces/app/translations");
  });

  it("다른 화면(Members·Add surface)에서도 같다", () => {
    expect(translations("/projects/acme/members")).toBe("/projects/acme/surfaces/app/translations");
    expect(translations("/projects/acme/surfaces/new")).toBe("/projects/acme/surfaces/app/translations");
  });

  it("보고 있는 표면이 기본보다 앞선다 — 표면 B에서 누르면 B에 머문다", () => {
    expect(translations("/projects/acme/surfaces/web/translations")).toBe("/projects/acme/surfaces/web/translations");
  });

  it("기본 표면을 모르면(보관·미설정) 옛 주소로 떨어진다 — 그쪽이 판정한다", () => {
    expect(translations("/projects/acme", [{ ...withDefault[0]!, defaultSurfaceSlug: null }])).toBe("/projects/acme/translations");
  });
});

describe("activeProject — pathname에서 프로젝트 컨텍스트", () => {
  it("Add surface의 new를 표면으로 읽어 죽은 편집 링크를 만들지 않는다", () => {
    const current = activeProject("/projects/acme/surfaces/new", memberships);
    expect(current).toEqual(memberships[0]);
    const items = navZones(current, { userName: "Shin", projectCount: 2 })[1]!.items;
    expect(items.find(item => item.key === "translations")!.href).toBe("/projects/acme/translations");
  });
  it("keeps surface B in both editing links without adding a sidebar section", () => {
    const current = activeProject("/projects/acme/surfaces/web/translations", memberships);
    expect(current).toMatchObject({ slug: "acme", surfaceSlug: "web" });
    const items = navZones(current, { userName: "Shin", projectCount: 2 })[1]!.items;
    expect(items.find(item => item.key === "translations")!.href).toBe("/projects/acme/surfaces/web/translations");
    expect(items.find(item => item.key === "sources")!.href).toBe("/projects/acme/sources");
    expect(items).toHaveLength(6);
  });
  it("프로젝트 라우트면 그 멤버십을 낸다", () => {
    expect(activeProject("/projects/acme/translations", memberships)).toEqual(memberships[0]);
    expect(activeProject("/projects/beta/settings", memberships)).toEqual(memberships[1]);
  });

  it("프로젝트 밖 라우트에는 컨텍스트가 없다 — 목록·생성 화면 (ARCHITECTURE §6.1)", () => {
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
 * ⚠️ **노출은 편의이고 방어가 아니다** (ARCHITECTURE §6.1). EDITOR가 URL로 직접 들어가면 페이지의
 * `requireProjectAccess`가 `not-found`를 낸다 — 여기서 항목을 숨기는 것은 없는 문을 안 보이게
 * 하는 것뿐이다. 그래서 판정을 `canPerform`이 하고 이 함수는 그것을 부르기만 한다.
 */
describe("projectSections — 역할이 항목을 정한다", () => {
  /**
   * ⚠️ **순서가 PRODUCT §7.7의 라우트 표 순서다** — Locales가 Translations 다음이다. **항목은 자기
   * 라우트와 같은 사이클에 온다** (6b-4 판정): 없는 라우트를 가리키는 항목은 404이고, 죽은 링크
   * 검사의 접두 규칙(`/projects/*`)이 그것을 못 잡는다. 7단계가 Logs로 그 표를 채웠다.
   */
  /**
   * ⚠️ **순서가 시안이다** (8-3) — Locales가 Translations **앞**이다. "어떤 언어가 있나"가
   * "그 언어를 채운다"보다 앞선 질문이어서이고, 순서를 바꾸면 사이드바가 다른 이야기를 한다.
   */
  // 2026-09-30 사용자 — 시안의 Members · Logs를 맞바꿨다.
  it("OWNER는 여섯을 본다 — Logs가 Members 앞이다", () => {
    expect(projectSections("OWNER").map((s) => s.key)).toEqual([
      "home",
      "sources",
      "translations",
      "logs",
      "members",
      "settings",
    ]);
  });

  it("EDITOR는 Project settings만 못 본다 — Home·Locales·Logs는 전원이 본다", () => {
    expect(projectSections("EDITOR").map((s) => s.key)).toEqual([
      "home",
      "sources",
      "translations",
      "logs",
      "members",
    ]);
  });

  /**
   * ⚠️ **Home은 접두로 재면 항상 활성이다** (6b-4 code-review ⚪2가 예고한 자리). `/projects/acme`는
   * 그 프로젝트의 **모든** 하위 라우트의 접두라, 번역 화면에 있어도 Home이 선택돼 보인다 — 어디에
   * 있는지를 사이드바가 거짓으로 말하는 것이고, 그것이 구역에 이름을 붙인 목적(추론이 아니라 표시)을
   * 무너뜨린다. **규칙은 축이 아니라 라우트 모양에 붙는다**: 하위 경로가 있는 항목만 접두다.
   */
  it("Home과 Logs가 정확히 일치다 — 하위 경로가 없다", () => {
    const byKey = new Map(projectSections("OWNER").map((s) => [s.key, s.exact]));
    expect(byKey.get("home")).toBe(true);
    // ⚠️ Logs의 `?cursor=`는 쿼리라 경로가 아니다 — 접두로 재도 결과가 같지만, 규칙이 **라우트
    // 모양**에 붙는다는 것을 지키면 다음 사람이 하위 라우트를 더할 때 여기서 걸린다.
    expect(byKey.get("logs")).toBe(true);
    for (const key of ["translations", "sources", "members", "settings"] as const) {
      expect(byKey.get(key), key).toBe(false);
    }
  });

  /**
   * ⚠️ **Logs도 `canPerform` 뒤가 아니다**. "내가 보낸 게 실제로 갔나"를 보는 사람이
   * 번역자이고, OWNER 전용으로 두면 그 질문에 답할 화면이 그 사람에게 없다.
   */
  it("Logs는 두 역할에 다 있다 — 번역자가 자기 전송 결과를 본다", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      expect(projectSections(role).map((s) => s.key), role).toContain("logs");
    }
  });

  /**
   * ⚠️ **Locales의 게이트도 `translation:write`다** (6b-2 관용구). 그 화면은 orphaned 로케일이 왜
   * 그렇게 됐는지를 말하는 유일한 자리이고, 번역자가 열이 사라진 이유를 알 길이 그것뿐이다 —
   * `project:settings` 뒤에 두면 EDITOR가 아예 못 들어온다.
   */
  it("Locales는 두 역할에 다 있다 — 컨트롤만 갈린다", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      expect(projectSections(role).map((s) => s.key), role).toContain("sources");
    }
  });

  /**
   * ⚠️ **Members는 `member:manage` 뒤가 아니다** (ARCHITECTURE §6.1). EDITOR도 목록을 본다 —
   * 옛 기능 문서 안에서 "EDITOR는 목록만 본다"와 "OWNER만"이 모순이었고 전자가 맞다. 컨트롤만
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

  /** ⚠️ 인덱스로 집지 않는다 — 6b-6이 Home을 맨 앞에 넣으면서 그 전제가 깨졌다. 키로 찾는다. */
  it("경로는 slug를 받아 만든다 — 화면이 문자열을 조립하지 않는다 (lib/routes.ts)", () => {
    const byKey = new Map(projectSections("EDITOR").map((s) => [s.key, s.href]));
    expect(byKey.get("home")?.("acme")).toBe("/projects/acme");
    expect(byKey.get("translations")?.("acme")).toBe("/projects/acme/translations");
    expect(byKey.get("logs")?.("acme")).toBe("/projects/acme/logs");
  });
});

/**
 * **축이 둘이고 구역이 그것을 드러낸다** (PRODUCT §7.7 — IA 확정 2026-09-09). 지금까지 사이드바는
 * 프로젝트 컨텍스트를 `usePathname`으로 **추론**했고, 사용자 축(목록·생성·계정)은 구분 선 아래
 * 이름 없는 묶음이었다 — 구역에 이름이 붙으면 "내가 어느 스코프에 있나"가 추론이 아니라 표시가 된다.
 *
 * ⚠️ **순서가 문서 순서다** — 사용자 축이 먼저다. 그 순서가 곧 "프로젝트는 내 일 안의 하나"라는
 * 정보구조이고, 뒤집으면 프로젝트가 없는 사용자에게 빈 자리가 위에 남는다.
 */
describe("navZones — 사용자 축과 프로젝트 축 (PRODUCT §7.7 · 8-3 시안)", () => {
  const project = (role: Role): NavProject => ({ slug: "acme", name: "Acme", role, archived: false });
  const ctx = { userName: "Shin", projectCount: 3 };

  it("프로젝트 컨텍스트가 있으면 구역이 둘이고 사용자 축이 먼저다", () => {
    expect(navZones(project("OWNER"), ctx).map((z) => z.key)).toEqual(["work", "project"]);
  });

  it("컨텍스트가 없으면 사용자 축 하나다 — 목록·생성·계정 화면에서 프로젝트 항목을 지어내지 않는다", () => {
    expect(navZones(null, ctx).map((z) => z.key)).toEqual(["work"]);
  });

  /**
   * ⚠️ **`New project`가 사용자 축에 없다** (2026-09-30 사용자 — 2026-09-27의 "Projects 바로 아래"를 되돌렸다). 앱 셸 헤더의
   * 아바타 왼쪽 버튼이 그 자리다.
   */
  it("사용자 축은 Projects · MCP connector · Account 순이다", () => {
    const items = navZones(null, ctx)[0]?.items ?? [];
    expect(items.map((i) => [i.key, i.href])).toEqual([
      ["projects", "/projects"],
      ["mcp", "/mcp"],
      ["account", "/account"],
    ]);
    // MCP connector — 공식 MCP 로고(`McpIcon`, 2026-09-29 사용자 — 옛 `Plug`) · 정확히 일치 · 배지 없음 · 라벨이 페이지 제목과 같은 키(핸드오프 §4).
    const mcp = items.find((i) => i.key === "mcp");
    expect(mcp?.label).toBe(m.common.nav.mcp);
    expect(mcp?.icon).toBe(McpIcon);
    expect(mcp?.exact).toBe(true);
    expect(mcp?.badge).toBeUndefined();
  });

  /** ⚠️ **구역 라벨이 이름 그대로다** — 사용자 축은 사용자 이름(옛 `Your work`를 대체했다). */
  it("사용자 구역의 라벨은 사용자 이름이다", () => {
    expect(navZones(null, { userName: "Shin", projectCount: 0 })[0]?.label).toBe("Shin");
  });

  it("프로젝트 구역의 라벨은 프로젝트 이름이다 — 어느 스코프인지 이름으로 말한다", () => {
    expect(navZones({ slug: "beta", name: "Beta", role: "EDITOR", archived: false }, ctx)[1]?.label).toBe("Beta");
  });

  /**
   * ⚠️ **판정은 `0`을 값으로 낸다** — `undefined`(개수 축이 없는 항목)와 `0`(셌더니 없음)은 다른 사실이다.
   * **0을 숨기는 것은 화면의 규칙이다**(2026-10-01 ux-drift-unify Q13 — `CountBadge`가 0이면 서지 않는다, DESIGN §6.4).
   * 여기서 0을 `undefined`로 접으면 그 규칙이 판정 층으로 새어 "셀 수 없음"과 "없음"이 한 값이 된다.
   */
  it("`Projects`에만 개수 배지가 붙고, 0도 값이다", () => {
    const items = navZones(null, { userName: "Shin", projectCount: 0 })[0]?.items ?? [];
    expect(items.map((i) => i.badge)).toEqual([0, undefined, undefined]);
    expect(navZones(null, ctx)[0]?.items[0]?.badge).toBe(3);
  });

  /**
   * **프로젝트 축의 개수 배지 셋** (2026-09-27 사용자 — PRODUCT §7.7 결정 5를 뒤집었다). 값은 셸이 이미 부르는
   * `loadMemberships`에 얹혀 와서 왕복이 늘지 않는다. ⚠️ **Translations는 프로젝트 전체 키 수다**(사용자) — 보고 있는
   * 표면을 따라 바뀌지 않는다.
   */
  it("Sources·Translations·Members에 개수 배지가 붙고, Translations는 표면과 무관하게 프로젝트 전체 키 수다", () => {
    const counted: NavProject = { ...project("OWNER"), defaultSurfaceSlug: "app", counts: { sources: 2, members: 0, keys: 31 } };
    const badges = (p: NavProject) => Object.fromEntries((navZones(p, ctx)[1]?.items ?? []).map((i) => [i.key, i.badge]));
    expect(badges(counted)).toEqual({ home: undefined, sources: 2, translations: 31, members: 0, logs: undefined, settings: undefined });
    expect(badges({ ...counted, surfaceSlug: "web" }).translations).toBe(31);
  });

  it("개수가 없으면 프로젝트 축에 배지가 없다", () => {
    const items = navZones(project("OWNER"), ctx)[1]?.items ?? [];
    expect(items.every((i) => i.badge === undefined)).toBe(true);
  });

  it("프로젝트 구역은 `projectSections`를 그대로 든다 — 권한 판정이 두 벌이 되지 않는다", () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      expect(navZones(project(role), ctx)[1]?.items.map((i) => i.key), role).toEqual(
        projectSections(role).map((s) => s.key),
      );
    }
  });

  /**
   * ⚠️ **6b-2 관용구다** — EDITOR도 Members·Translations·Locales·Logs를 본다. 빠지는 것은
   * `project:settings` 하나뿐이다.
   */
  it("EDITOR에게 빠지는 항목은 Project settings 하나다 — 나머지는 전원이 본다", () => {
    const keys = (role: Role): string[] =>
      navZones(project(role), ctx).flatMap((z) => z.items.map((i) => i.key));
    expect(keys("OWNER").filter((k) => !keys("EDITOR").includes(k))).toEqual(["settings"]);
  });

  it("사용자 축은 전부 정확히 일치다 — `/projects`가 `/projects/new`의 접두다", () => {
    const work = navZones(null, ctx)[0];
    expect(work?.items.length).toBeGreaterThan(0);
    for (const item of work?.items ?? []) expect(item.exact, item.key).toBe(true);
  });

  it("항목마다 아이콘과 **완성된** href가 있다 (DESIGN §6.8)", () => {
    for (const zone of navZones(project("OWNER"), ctx)) {
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

/**
 * 하단 전역 항목 (8-3). **라우트가 아니라 "앱을 벗어나는 것"이라 구역 밖이다.**
 */
describe("navFooterItems", () => {
  /**
   * ⚠️ **Changelog → Docs 순서다** (2026-09-27 사용자 — 라벨·행선지는 2026-09-28에 앱 안 `/changelog`로). 둘 다 내부이고,
   * 아이콘은 사용자 메뉴의 같은 항목과 같은 글리프다 — 같은 곳을 두 글리프로 가리키지 않는다.
   */
  // 외부 링크 항목이 없어져 `NavItem.external`도 사라졌다 — 새 탭 여부는 사이드바 DOM 테스트(`sign-out-pending`)가 본다.
  it("Changelog(`/changelog`) 다음 Docs(`/docs`)다", () => {
    expect(navFooterItems().map((i) => ({ key: i.key, label: i.label, href: i.href }))).toEqual([
      { key: "changelog", label: m.changelog.title, href: "/changelog" },
      { key: "docs", label: m.publicDocs.docs.title, href: "/docs" },
    ]);
    expect(navFooterItems().map((i) => i.icon)).toEqual([Compass, CircleHelp]);
  });

  /**
   * **Changelog 행 오른쪽에 현재 앱 버전 배지** (2026-09-28 사용자 — 개수 배지와 같은 자리·같은 모양, 글자는 `x.y.z`만).
   * 값은 빌드가 박는다(`lib/app-version.ts`). 비면 배지를 싣지 않는다 — 빈 칩이 서지 않게.
   */
  describe("버전 배지", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("Changelog가 현재 버전을 배지로 든다 — Docs는 배지가 없다", () => {
      vi.stubEnv("APP_VERSION", "1.0.3");
      const items = navFooterItems();
      expect(items.find((i) => i.key === "changelog")?.badge).toBe("1.0.3");
      expect(items.find((i) => i.key === "docs")?.badge).toBeUndefined();
    });

    it("버전이 비면 배지가 없다", () => {
      vi.stubEnv("APP_VERSION", undefined);
      expect(navFooterItems().find((i) => i.key === "changelog")?.badge).toBeUndefined();
    });
  });

  it("Sign out은 LNB에 없다 — 사용자 메뉴에만 있다 (2026-09-27 사용자)", () => {
    expect(navFooterItems().some((i) => i.key === "signOut")).toBe(false);
  });
});

describe("프로젝트 설정 항목의 라벨", () => {
  /**
   * ⚠️ **2026-09-23에 `Project settings`에서 `Settings`로 줄었다** (사용자). 같은 날 계정 항목이
   * `Account`가 되어 사이드바에 `Settings`가 하나만 남으므로 "어느 설정인가"가 다시 생기지 않는다.
   */
  it("LNB 라벨이 `Settings`다", () => {
    const item = projectSections("OWNER").find((s) => s.key === "settings");
    expect(item?.label).toBe("Settings");
  });

  /** 문장·링크가 메뉴에 없는 이름으로 그 화면을 부르면 사이드바에서 찾을 수 없다. */
  /**
   * ⚠️ **예외 한 자리 — MCP 토큰의 허용 동작 이름**(mcp-connector spec 완료조건 2 · 핸드오프 §12). 그것은 화면이 아니라 **권한**
   * (`project:settings` — Sources·Sync·기준 브랜치·push 토큰·보관)의 이름이고 설정 화면 하나를 가리키지 않는다. 그 줄만 빼고 센다.
   */
  it("화면 문구가 옛 이름 `Project settings`로 그 화면을 부르지 않는다", () => {
    const src = readFileSync(join(process.cwd(), "messages/en.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
    const GRANT = '"project:settings": { label: "Project settings",';
    expect(src.split(GRANT).length - 1).toBe(1);
    expect(src.replace(GRANT, "")).not.toMatch(/[Pp]roject settings/);
  });
});
