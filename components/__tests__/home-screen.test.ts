import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Home(`/projects/:slug`)의 배선을 **소스에서** 센다 (6b-6).
 *
 * ⚠️ 이 화면에는 지켜야 할 것이 둘 있고 **둘 다 렌더 테스트가 없는 층**이다:
 *
 * 1. **착지 클릭 하나를 갚는다** (SAAS §7.7 결정 1이 받아들인 대가). 번역자의 일은 `translations`
 *    하나이므로, 개요만 있고 링크가 없으면 그 클릭이 **순손실**이다. 진행률·활동이 링크인지가
 *    이 화면의 완료 조건이고, 장식이 아니다.
 * 2. **다른 화면의 지표를 복제하지 않는다** (결정 2). 번역 화면 툴바가 키 수·미배포 건수·마지막
 *    전송·PR 링크를 들고, 설정 화면이 리포·연결·적재 상태를 든다 — 세 번째 사본을 만들면 그중
 *    하나가 낡는다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** ⚠️ **주석을 벗기고 센다** — docstring이 자기가 피하는 것을 이름으로 적는다. */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const HOME = "app/(edit)/projects/[slug]/page.tsx";

describe("Home — 개요가 일로 이어진다 (6b-6)", () => {
  const src = read(HOME);

  it("게이트가 `translation:write`다 — 번역자가 착지하는 화면이다", () => {
    expect(src).toContain("requireProjectAccess");
    expect(src).toMatch(/permission:\s*"translation:write"/);
  });

  /**
   * ⚠️ **진행률 행이 링크여야 한다.** `?locales=`를 실어 그 로케일만 보이는 번역 화면에 착지시키는
   * 것이 개요가 일로 이어지는 유일한 수단이다 — 숫자만 보이면 사용자가 사이드바로 되돌아간다.
   *
   * ⚠️ **8-4에서 `?focus=`가 `?locales=`로 바뀌었다** — 로케일이 열이 아니라 행이 되면서 "기준 열"에
   * 화면의 대응물이 없어졌다. 단일 선택이라 이 링크의 동작은 같다.
   */
  it("진행률 행이 `?locales=`를 실은 번역 화면 링크다", () => {
    expect(src).toMatch(/routes\.translations\([^)]*locales/);
  });

  /** 활동 항목은 그 편집이 있던 네임스페이스와 로케일로 데려간다 — "무엇이 바뀌었나"에서 "고치자"로. */
  it("활동 항목이 `?ns=`와 `?locales=`를 실은 링크다", () => {
    expect(src).toMatch(/ns:/);
    expect(src).toMatch(/locales:/);
  });

  it("순수 판정을 `lib/home/overview`에서 받는다 — 화면이 집계하지 않는다", () => {
    expect(src).toMatch(/from "@\/lib\/home\/overview"/);
    expect(src).toMatch(/activeLocaleProgress\(/);
    expect(src).toMatch(/recentActivity\(/);
  });

  /**
   * ⚠️ **툴바의 지표를 다시 세지 않는다** (결정 2). `countUnpublished`는 번역 화면 툴바의 숫자이고
   * Home이 그것을 또 세면 사본이 둘이 된다 — 그중 하나가 낡는 것이 이 결정이 막는 것 전부다.
   */
  it("`countUnpublished`를 부르지 않는다 — 미배포 건수는 툴바의 것이다", () => {
    expect(src).not.toMatch(/countUnpublished/);
  });

  /** 진행률은 6b-5의 조회를 그대로 쓴다 — `loadKeys`는 행마다 셀과 refs를 들고 와 903키에서 무겁다. */
  it("진행률 재료를 `loadLocaleCounts`에서 받는다 — `loadKeys`를 부르지 않는다", () => {
    expect(src).toMatch(/loadLocaleCounts\(/);
    expect(src).not.toMatch(/loadKeys\(/);
  });
});

/**
 * **프로젝트 루트 링크가 Home을 가리킨다** (SAAS §7.7 결정 1 — 진입의 착지점).
 *
 * ⚠️ 6b-6 전까지 이 자리들은 전부 `routes.translations(slug)`였다. 하나라도 남으면 **같은
 * "프로젝트로 간다"가 어디서 눌렀는지에 따라 다른 곳에 착지하고**, 그 불일치는 눈에 안 보인다.
 */
describe("프로젝트 루트 링크는 `routes.project`다 (6b-6)", () => {
  /**
   * 프로젝트 하위 화면 다섯 — **breadcrumb이 있던 자리들**이다.
   *
   * ⚠️ **8-4가 그 breadcrumb 다섯을 전부 지웠다** (spec Q5). 그래서 이 목록은 더 이상 "루트 링크를
   * 드는 자리"가 아니라 **"루트 의미로 번역 화면을 가리키면 안 되는 자리"**의 목록이다 — 아래
   * 부정 단언이 그 축이고, 긍정 단언의 대상은 `ROOT_LINK_SITES` 둘로 줄었다.
   */
  const SITES = [
    "app/(edit)/projects/page.tsx",
    "components/translations/header.tsx",
    "app/(edit)/projects/[slug]/locales/page.tsx",
    "app/(edit)/projects/[slug]/members/page.tsx",
    "app/(edit)/projects/[slug]/settings/page.tsx",
    "app/(edit)/projects/[slug]/logs/page.tsx",
  ];

  /**
   * ⚠️ **사이드바가 아니라 `lib/shell/nav.ts`다** (8-3). 스위처가 사라지면서 그 호출이 화면에서
   * 판정층으로 내려갔다 — 셸에서 프로젝트 루트로 가는 자리는 이제 `Home` 항목 하나이고 그 href를
   * 만드는 것이 `projectSections`다.
   *
   * ⚠️ **8-4에서 둘로 줄었다** — breadcrumb 다섯이 사라졌고, 위로 가는 길은 사이드바가 든다.
   */
  const ROOT_LINK_SITES = ["app/(edit)/projects/page.tsx", "lib/shell/nav.ts"];

  it("두 자리가 전부 `routes.project`를 쓴다", () => {
    for (const path of ROOT_LINK_SITES) {
      expect(read(path), path).toMatch(/routes\.project\(/);
    }
  });

  /**
   * ⚠️ **breadcrumb이 하나도 안 남았다** (8-4 spec Q5) — 번역 화면에서만 떼면 형제 라우트 넷과
   * 어긋난 상태로 배포된다. `components/ui/breadcrumb.tsx`는 지우지 않는다(`/projects/new`가
   * 프로젝트 컨텍스트 밖이라 사이드바가 길을 못 준다).
   */
  it("프로젝트 하위 화면 다섯(과 목록)에 `Breadcrumb`이 없다", () => {
    for (const path of SITES) {
      expect(read(path), path).not.toMatch(/<Breadcrumb/);
    }
  });

  /**
   * ⚠️ **이 화면들에 `routes.translations(slug)`가 남아 있으면 안 된다.** 쿼리를 실은
   * 호출(`routes.translations(slug, { locales })`)은 번역 화면으로 **가려는** 것이라 대상이 아니다 —
   * 인자가 slug 하나인 호출만 센다.
   */
  it("루트 의미로 `routes.translations(slug)`를 쓰는 자리가 없다", () => {
    const BARE = /routes\.translations\(\s*(?:slug|membership\.slug)\s*\)/;
    for (const path of SITES) {
      expect(read(path), path).not.toMatch(BARE);
    }
  });

  /** 나브의 Translations 항목은 반대다 — 그 항목이 가리키는 곳이 번역 화면이다. */
  it("나브의 Translations 항목은 여전히 번역 화면이다", () => {
    expect(read("lib/shell/nav.ts")).toMatch(/routes\.translations\(slug\)/);
  });
});
