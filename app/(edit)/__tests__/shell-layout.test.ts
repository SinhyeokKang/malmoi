import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **셸은 뷰포트에 고정되고 콘텐츠 컬럼만 스크롤한다** (DESIGN §6.5).
 *
 * ⚠️ 회귀 (malmoi#13, 2026-09-08 `/bugshot-qa` preview 실측): 셸 루트가 `min-h-svh`였고 `aside`·`header`가
 * `position: static`이라, 콘텐츠가 뷰포트보다 길면 **문서 전체가 스크롤되면서 셸이 함께 밀려 올라갔다.**
 * 24키짜리 번역 화면에서도 `scrollHeight` 1483 / 뷰포트 775였고, **Sign out(top 1411)과
 * Collapse sidebar(top 1443)가 스크롤 전부터 화면 밖**이었다 — 사이드바 접기는 그 버튼이 유일한 경로다.
 *
 * ⚠️ **렌더 테스트를 두지 않는 리포라**(translation-ui design §4) 소스로 센다. `focus-ring`·`globals-css`와
 * 같은 계열이고, 이 결함의 조건이 정확히 **레이아웃 클래스 조합**이라 그 층에서 판정이 성립한다.
 * 실물 확인은 `/bugshot-qa`가 계속 든다.
 *
 * **8-2(2026-09-10)가 골격을 시안으로 옮기면서 검사가 늘었다** — 셸이 "배경 위에 뜬 패널 셋"이 됐고
 * (DESIGN §6.5), 그 구조는 padding·gap·배경 대비가 **함께** 있어야
 * 성립한다. 8-1b가 그중 몇을 한꺼번에 빠뜨린 전례가 있어 하나씩 센다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const layout = read("app/(edit)/layout.tsx");
const sidebar = read("components/shell/sidebar.tsx");
const header = read("components/shell/header.tsx");
const contentPanel = read("components/shell/content-panel.tsx");
const projectLayout = read("app/(edit)/projects/[slug]/layout.tsx");
const projectPanel = read("components/shell/project-panel.tsx");

describe("셸 레이아웃 — 뷰포트 고정", () => {
  it("셸 루트가 뷰포트 높이에 **고정**된다 — `min-h-svh`는 문서를 늘린다", () => {
    // `min-h-svh`는 "최소 한 화면"이라 콘텐츠가 길면 컨테이너가 함께 자란다. 그러면 그 안의
    // `aside`가 stretch로 문서 높이만큼 늘어나 하단 항목이 화면 밖으로 나간다.
    expect(layout).not.toMatch(/className="[^"]*\bmin-h-svh\b/);
    expect(layout).toMatch(/className="[^"]*\bh-svh\b/);
  });

  it("루트가 넘침을 가둔다 — 문서가 스크롤되면 셸이 딸려 올라간다", () => {
    expect(layout).toMatch(/className="[^"]*\bh-svh\b[^"]*\boverflow-hidden\b/);
  });

  /**
   * ⚠️ **스크롤이 패널이 아니라 `PanelBody`에 있다** (2026-09-11 사용자). 패널이 통째로 스크롤하면
   * 제목·툴바가 콘텐츠와 함께 올라가는데, 그 둘은 "지금 보고 있는 것이 무엇인지"를 말하므로 화면에
   * 붙어 있어야 한다. 패널은 `overflow-hidden`으로 **경계만** 만들고, 문서가 스크롤되면 셸이 딸려
   * 올라가는 것(malmoi#13)은 그대로 막힌다.
   *
   * ⚠️ **`min-h-0`이 `flex-1`의 짝이라는 것까지 센다** — 없으면 본문 열이 콘텐츠 높이 아래로 못
   * 줄어들어 패널이 통째로 늘어나고, 스크롤이 본문이 아니라 바깥에 생겨 **머리가 다시 같이
   * 올라간다.** 눈으로는 "스크롤은 되네"로 보여서 못 알아챈다.
   */
  it("패널은 넘침을 가두고, 스크롤은 `PanelBody`가 든다", () => {
    expect(contentPanel).toMatch(/<main className="[^"]*\boverflow-hidden\b/);
    expect(contentPanel).not.toMatch(/<main className="[^"]*\boverflow-y-auto\b/);
    expect(contentPanel).toMatch(/export function PanelBody\b/);
    expect(contentPanel).toMatch(/className="min-h-0 flex-1 overflow-y-auto"/);
  });

  /** ⚠️ **머리가 `shrink-0`이다** — flex 자식의 축소 하한은 콘텐츠 높이가 아니라 0이라, 본문이 길면 눌린다. */
  it("`PanelHeader`가 눌리지 않는다", () => {
    expect(contentPanel).toMatch(/export function PanelHeader\b/);
    expect(contentPanel).toMatch(/className="shrink-0"/);
  });

  /**
   * ⚠️ **폭 상한이 스크롤 컨테이너가 아니라 안쪽 래퍼에 있어야 한다** (2026-09-11 사용자).
   * `overflow-y-auto`를 든 요소를 좁히면 **스크롤바가 콘텐츠 옆에** 생긴다 — 화면 다섯이
   * `max-w-4xl`을 안쪽 래퍼에 두는 이유가 그것이고, 프리미티브로 올리면서 같은 함정이 따라온다.
   *
   * ⚠️ **눈으로는 "폭이 맞네"로 보인다** — 스크롤바 위치는 콘텐츠가 넘칠 때만 드러난다.
   */
  it("폭 상한이 스크롤 컨테이너에 붙지 않았다", () => {
    // 바깥(스크롤·shrink) 요소의 className에는 `max-w-`가 없다.
    const outers = [...contentPanel.matchAll(/<div className="([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(outers.filter((cls) => /max-w-/.test(cls))).toEqual([]);
    // 상한 자체는 `cn(...)`을 지나는 안쪽 래퍼가 든다.
    expect(contentPanel).toMatch(/const CONTENT_MAX = "mx-auto w-full max-w-7xl"/);
    expect(contentPanel).toMatch(/cn\(CONTENT_MAX, className\)/);
    expect(contentPanel).toMatch(/cn\(CONTENT_MAX, "min-h-full", className\)/);
  });

  /**
   * ⚠️ **본문 래퍼가 `min-h-full`을 든다** — `/projects`가 `flex flex-col`을 넘겨 빈 상태를
   * `flex-1`로 세로 중앙에 세운다. 래퍼 높이가 auto면 그 `flex-1`이 먹을 높이가 없어 빈 상태가
   * 위에 붙는다. 데이터가 0건일 때만 드러나는 부류다.
   */
  it("본문 래퍼가 패널 높이를 이어받는다", () => {
    expect(contentPanel).toMatch(/min-h-full/);
  });

  it("사이드바도 자기 안에서 스크롤한다 — 항목이 늘어도 문서를 밀지 않는다", () => {
    expect(sidebar).toMatch(/\boverflow-y-auto\b/);
  });
});

/**
 * **화면은 배경 위에 패널이 떠 있는 구조이고, 그 여백이 패널의 경계를 만든다** (규약 3.5).
 *
 * ⚠️ **하나씩 빠지는 것이 아니라 구조 전체가 함께 사라진다.** 8-1b 초안이 `grid-cols-2`로 꽉 채웠다가
 * padding·gap·radius·border·shadow를 한꺼번에 잃었다 — 그래서 항목을 나눠 센다.
 */
describe("셸 골격 — 바깥 padding 8 · 패널 간 gap 8 (8-2)", () => {
  it("루트가 캔버스 배경이다 — 흰 패널과 흰 배경이 붙으면 경계가 통째로 사라진다", () => {
    expect(layout).toMatch(/\bbg-canvas\b/);
  });

  it("바깥 padding 8과 패널 간 gap 8을 든다", () => {
    expect(layout).toMatch(/className="[^"]*\bp-2\b/);
    expect(layout).toMatch(/className="[^"]*\bgap-2\b/);
  });

  /**
   * ⚠️ **최소 대응 너비가 1280이고 그 아래는 가로 스크롤이 정상이다** (규약 3 · DESIGN §5).
   * 루트에 `min-w-`가 없으면 스크롤이 아니라 **콘텐츠가 압축돼 잘린다** — 둘은 다르다.
   */
  it("루트가 1280을 하한으로 든다 — 없으면 잘림이지 스크롤이 아니다", () => {
    expect(layout).toMatch(/min-w-\[1280px\]/);
  });

  it("헤더가 전폭 48이고 로고와 사용자 메뉴 둘을 든다", () => {
    expect(header).toMatch(/\bh-12\b/);
    expect(header).toContain("UserMenu");
    expect(header).toContain("routes.projects()");
  });

  /**
   * ⚠️ **top bar는 헤더가 흡수했다** — PRODUCT의 "top bar가 사라진다"는 *지금의* top bar 얘기이고
   * 그 자리에 전폭 48 헤더가 온다. 파일이 남아 있으면 셸의 상단이 두 벌이 된다.
   */
  it("옛 top bar가 남아 있지 않다", () => {
    expect(() => read("components/shell/top-bar.tsx")).toThrow();
    expect(layout).not.toContain("TopBar");
  });

  it("사이드바가 240이다", () => {
    expect(sidebar).toMatch(/\bw-60\b/);
  });

  /**
   * ⚠️ **모바일 분기를 새로 만들지 않고, 남아 있던 것은 이 배송에서 걷는다** (규약 3).
   * 1280 고정에서 `xl:`(1280) 분기는 **항상 참**이라 죽은 코드이고, 오버레이·햄버거는 도달 불가다.
   */
  it("사이드바에 반응형 분기가 0개다 — 1280 고정이라 죽은 코드다", () => {
    expect(sidebar).not.toMatch(/\b(?:sm|md|lg|xl|2xl):/);
    expect(sidebar).not.toContain("mobileOpen");
    expect(sidebar).not.toMatch(/\bfixed inset-y-0\b/);
  });

  it("콘텐츠 패널이 흰 패널이다 — 배경·radius·border·그림자 넷이 함께 있어야 뜬다", () => {
    expect(contentPanel).toMatch(/\bbg-background\b/);
    expect(contentPanel).toMatch(/\brounded-xl\b/);
    expect(contentPanel).toMatch(/\bborder-border-subtle\b/);
    expect(contentPanel).toMatch(/\bshadow-low\b/);
  });

  it("오른쪽 패널이 320이고 같은 패널 규칙을 든다", () => {
    expect(projectPanel).toMatch(/\bw-80\b/);
    expect(projectPanel).toMatch(/\bbg-background\b/);
    expect(projectPanel).toMatch(/\brounded-xl\b/);
    expect(projectPanel).toMatch(/\bborder-border-subtle\b/);
    expect(projectPanel).toMatch(/\bshadow-low\b/);
  });

  /**
   * ⚠️ **오른쪽 패널이 `[slug]` 레이아웃에 사는 이유**: 셸(`app/(edit)/layout.tsx`)은 `/projects`
   * 목록도 감싸 `[slug]` params를 못 받는다. 8-P(diff)와 8-3(breadcrumb·Publish)이 **서버 데이터**를
   * 필요로 하므로 그 자리가 프로젝트 레이아웃이어야 한다.
   */
  it("오른쪽 패널은 프로젝트 레이아웃이 든다 — 셸은 slug를 모른다", () => {
    expect(projectLayout).toMatch(/<ProjectPanel\b/);
    expect(layout).not.toMatch(/<ProjectPanel\b/);
  });
});

/**
 * **모든 `(edit)` 라우트가 정확히 하나의 콘텐츠 패널을 지난다.**
 *
 * ⚠️ 셸이 `{children}`을 흰 패널로 감싸지 **않는** 것이 이 검사의 이유다 — 감싸면 오른쪽 패널이 그
 * 안에 갇혀 시안의 "패널 둘이 gap 8로 나란히"가 성립하지 않는다. 대신 패널을 각 갈래가 들고,
 * 하나라도 빠지면 그 화면만 캔버스 위에 맨몸으로 뜬다(**빈 화면이 아니라 어긋난 화면**이라 눈에
 * 잘 안 띈다). 둘이면 흰 패널이 겹쳐 padding이 두 배가 된다.
 */
describe("콘텐츠 패널 — 라우트마다 정확히 하나", () => {
  const EDIT = join(ROOT, "app/(edit)");

  function pages(dir: string, base = ""): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === "__tests__") continue;
      const full = join(dir, name);
      const rel = base === "" ? name : `${base}/${name}`;
      if (statSync(full).isDirectory()) out.push(...pages(full, rel));
      else if (name === "page.tsx") out.push(rel);
    }
    return out;
  }

  /** 페이지 자신 + 조상 레이아웃 전부 — 렌더 트리에 실제로 들어가는 소스들이다. */
  function chain(pageRel: string): string[] {
    const parts = pageRel.split("/");
    const files = [join(EDIT, pageRel)];
    for (let i = parts.length - 1; i >= 0; i--) {
      const dir = join(EDIT, ...parts.slice(0, i));
      const candidate = join(dir, "layout.tsx");
      try {
        if (statSync(candidate).isFile()) files.push(candidate);
      } catch {
        // 그 층에 레이아웃이 없다 — 정상이다.
      }
    }
    return files;
  }

  const found = pages(EDIT);

  it("페이지를 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(found.length).toBeGreaterThan(3);
  });

  /**
   * ⚠️ **본문 랜드마크를 `ContentPanel`이 든다** (2026-09-11 — 패널 레이아웃). 그 전엔 페이지마다
   * 하나씩이라 **관행**이었고, 실제로 8-2가 목록의 `<main>`을 패널로 갈아끼우면서 그 화면만
   * 랜드마크를 잃었다 (Codex 리뷰 2026-09-11 실측: `/projects`에서
   * `document.querySelectorAll('main,[role="main"]').length === 0`). 눈으로는 아무 차이가 없고
   * 스크린리더의 "본문으로 건너뛰기"만 그 화면에서 안 들었다.
   *
   * ⚠️ **그때는 "패널을 `<main>`으로 바꾸면 나머지 화면의 것과 중첩된다"가 이유였는데, 지금은
   * 화면이 자기 `<main>`을 안 든다** — 머리/본문을 가르면서 전부 걷었다. 그래서 라우트당 하나가
   * **구조로** 보장되고, 이 검사는 "체인에 있나"가 아니라 **"화면이 자기 것을 또 들지 않나"**를
   * 함께 센다. 중첩된 `<main>`은 랜드마크를 둘로 만들고 브라우저가 그것을 고쳐주지 않는다.
   */
  it("본문 랜드마크가 패널 하나다 — 화면이 자기 `<main>`을 들지 않는다", () => {
    expect(contentPanel).toMatch(/<main /);
    /**
     * ⚠️ **여는 태그만 센다** — `includes("<main")`이면 **주석 안의 표기**(`` `<main>` ``)까지 잡혀,
     * 통과시키려고 주석의 낱말을 바꾸게 된다. 그건 결함을 고치는 게 아니라 검사를 피하는 것이고,
     * 그 자리의 주석은 대개 "왜 여기가 랜드마크가 아닌가"를 설명하는 문장이라 **지우면 안 되는 쪽**이다.
     */
    const nested = found.filter((rel) => /^\s*<main[\s/>]/m.test(readFileSync(join(EDIT, rel), "utf8")));
    expect(nested).toEqual([]);
  });

  it("각 페이지의 체인에 콘텐츠 패널이 정확히 하나다", () => {
    const wrong = found
      .map((rel) => ({
        rel,
        count: chain(rel).filter((f) => readFileSync(f, "utf8").includes("<ContentPanel")).length,
      }))
      .filter((r) => r.count !== 1);
    expect(wrong).toEqual([]);
  });
});
