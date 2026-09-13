import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 프로젝트 목록 화면의 배선을 **소스로** 센다 (8-3 — `translations-screen`·`home-screen`과 같은 계보).
 * 렌더 테스트가 없는 리포라(translation-ui design §4) 이 층이 방어선이다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/**
 * ⚠️ **주석을 벗기고 센다** (`focus-ring`·`no-korean-ui`와 같은 관용구). 이 파일의 검사가 찾는
 * 리터럴은 **주석이 자기를 설명하면서 그대로 적는** 부류다 — 실제로 `"use client"`를 금지하는
 * 주석 한 줄이 그 검사를 즉시 red로 만들었다.
 */
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * ⚠️ **소스가 둘이다** (new-project-modal T8). 본문이 `components/projects/project-list.tsx`로
 * 내려갔다 — `/projects/new`가 같은 목록을 모달 뒤에 그리기 때문이고, 라우트 페이지에는
 * `<ContentPanel>`과 데이터 로드만 남았다. **단언은 그대로이고 읽는 자리만 늘린다.**
 */
const PAGE = ["app/(edit)/projects/page.tsx", "components/projects/project-list.tsx"];

describe("프로젝트 목록 — 필터는 URL이고 클라이언트 상태가 아니다", () => {
  /**
   * ⚠️ **세그먼트를 `useState`로 만들면 뒤로가기·공유·새로고침이 전부 깨진다.** `logs`의 `?cursor=`가
   * 같은 판정이고(design 결정 14), 서버가 이미 필터된 목록을 그리므로 클라이언트 상태가 0이어야 한다.
   */
  it("페이지가 클라이언트 컴포넌트가 아니다", () => {
    expect(PAGE.map(code).join("\n")).not.toContain('"use client"');
    expect(PAGE.map(code).join("\n")).not.toContain("useState");
  });

  /**
   * ⚠️ **필터 축이 사라졌다** (projects-list §1). 좁히는 것은 `?q=` 하나이고, 옛 `?filter=`는
   * **조용히 무시된다** — 읽는 코드가 목록 경로에 하나도 없어야 그 계약이 성립한다.
   */
  it("좁히는 축이 검색 하나다 — `?filter=`를 읽는 코드가 없다", () => {
    const src = PAGE.map(code).join("\n");
    expect(src).toContain("searchParams");
    expect(src).not.toContain("parseProjectFilter");
    expect(src).not.toContain("filterProjects");
    expect(src).not.toMatch(/as ProjectFilter/);
  });

  /**
   * ⚠️ **검색이 `routes.projects({ q })`를 지나야 한다.** 문자열 연결로 만들면
   * `entry-points.test.ts`의 "쿼리 파라미터 수신자" 검사를 통째로 회피한다 (`lib/routes.ts` 주석).
   * 전에는 탭 링크가 이 자리를 지켰는데, 그것이 사라지면서 검색창이 유일한 생산자가 됐다.
   */
  it("검색 링크를 `routes.projects`가 만든다", () => {
    const src = read("components/projects/search-input.tsx");
    expect(src).toMatch(/routes\.projects\(\s*\{/);
  });

  it("행 전체가 `routes.project(slug)` 링크다 — 착지점이 한 곳이다", () => {
    expect(PAGE.map(code).join("\n")).toContain("routes.project(");
  });
});

describe("프로젝트 목록 — 배지는 항상 하나이고 갈래는 순수 함수가 정한다", () => {
  /**
   * ⚠️ **갈래를 화면에서 다시 조립하지 않는다.** 보관·연결 전·첫 적재 전·정상 넷이고 **순서가
   * 판정의 절반**이다(보관이 readiness보다 앞이다 — `lib/projects/list.ts`). 화면이 삼항으로 다시
   * 쓰면 그 순서가 두 벌이 되고, 그중 하나가 낡는다.
   */
  it("`projectStatus` 하나로 갈래를 정한다", () => {
    const src = PAGE.map(code).join("\n");
    expect(src).toContain("projectStatus(");
    // 옛 계약(`ready`면 배지 없음)이 남아 있으면 상태가 두 규칙으로 갈린다.
    expect(src).not.toContain("readinessLabel");
    expect(src).not.toContain("planProjectReadiness");
  });

  /**
   * ⚠️ **보관을 목록에서 숨기지 않는다** (7단계). `Archived` 탭이 생겨도 기본 탭이 `all`이므로 그
   * 결정은 그대로다 — 배지가 없으면 `all`에서 보관된 프로젝트가 살아 있는 것과 구별되지 않는다.
   */
  it("상태 문구를 사전에서 읽는다 — 네 갈래가 전부 화면에 닿는다", () => {
    expect(PAGE.map(code).join("\n")).toMatch(/m\.projects\.status\[/);
  });

  /**
   * ⚠️ **배지 색을 삼항으로 고르지 않는다.** 갈래가 늘면 맵은 키가 없어 컴파일 에러가 나지만,
   * 삼항은 새 갈래를 **사유 없이** 기본값으로 떨어뜨리고 `tsc`가 조용하다
   * (`lib/auth/landing.ts`가 같은 이유로 맵 + `satisfies`를 쓴다 — 실측된 함정이다).
   */
  it("배지 색이 맵 + `satisfies`다", () => {
    const src = PAGE.map(code).join("\n");
    expect(src).toMatch(/satisfies Record<ProjectStatus,/);
    expect(src).toContain("STATUS_VARIANT[status]");
  });

  /**
   * ⚠️ **`warning`은 "누군가 뭔가를 더 해야 끝나는" 셋에만 붙는다.** `Archived`를 amber로 칠하면
   * 의도된 상태가 문제처럼 읽힌다.
   *
   * ⚠️ **`Active`가 초록이다** (2026-09-11 사용자 — 그 전엔 `neutral`이었고 이 단언이 그것을
   * 고정했다). DESIGN §6.1("가장 흔한 상태가 가장 조용하다")의 예외이고, 근거는 **이 목록이
   * 훑어보는 화면**이라는 것 — 손볼 프로젝트가 튀어나오려면 정상인 것도 색을 들어야 대비가 생긴다.
   * 예외를 문서가 아니라 여기서도 고정하는 이유는, 다음 사람이 §6.1만 읽고 되돌리면 그 되돌림이
   * 조용하기 때문이다.
   */
  it("정상은 초록, amber는 `Disconnected` 하나, 나머지 셋은 무색이다", () => {
    const map = /const STATUS_VARIANT = \{([\s\S]*?)\}/.exec(PAGE.map(code).join("\n"))?.[1] ?? "";
    expect(map).not.toBe("");
    expect(map).toMatch(/archived:\s*"neutral"/);
    expect(map).toMatch(/active:\s*"success"/);
    /**
     * ⚠️ **온보딩 중인 둘은 amber가 아니다** (2026-09-11 사용자). 새 프로젝트가 지나가는 정상
     * 경로이고 시간이 지나면 저절로 `Active`가 된다 — amber로 칠하면 고장난 것처럼 보인다.
     */
    expect(map).toMatch(/setup:\s*"neutral"/);
    expect(map).toMatch(/awaiting_first_sync:\s*"neutral"/);
    /** ⚠️ **한때 돌던 것이 멈춘 것**이라 사람이 손대야 풀린다 — amber가 여기 하나만 남았다. */
    expect(map).toMatch(/needs_reconnect:\s*"warning"/);
  });

  /**
   * ⚠️ **역할이 배지가 아니라 메타 평문이다** (시안 개정). 배지로 만들면 우측에서 상태와 나란히
   * 놓여 어느 쪽이 "지금 벌어지는 일"인지 흐려진다.
   */
  it("역할을 메타 줄이 든다", () => {
    expect(PAGE.map(code).join("\n")).toContain("m.projects.role[row.role]");
    expect(PAGE.map(code).join("\n")).not.toMatch(/<Badge[^>]*>\s*\{m\.projects\.role/);
  });
});

describe("프로젝트 목록 — 행이 잘리지 않고 본문이 스크롤한다", () => {
  /**
   * ⚠️ **`overflow-hidden`을 든 flex 자식은 축소 하한이 0이다.** CSS의 automatic minimum size는
   * 스크롤 컨테이너에 적용되지 않아, `<ul>`이 내용 높이 대신 **남은 공간까지 줄어들고** 넘친 행은
   * 그 안에 감춰진다 — 바깥 패널에는 스크롤이 생기지 않으므로 **휠로도 못 본다**.
   *
   * 실측 (Codex 리뷰 2026-09-11): 프로젝트 2개·1280×360에서 `ul` clientHeight 124 / scrollHeight 161,
   * 바깥 패널은 clientHeight === scrollHeight 286. 둘째 행의 메타와 배지가 잘렸다.
   *
   * ⚠️ 주석의 "행이 최대 셋"은 계약이 아니다 — `PROJECT_LIMIT`은 **내가 OWNER인 살아 있는** 프로젝트만
   * 세고, 이 목록은 초대받은 것과 보관한 것까지 든다.
   */
  it("목록이 축소되지 않는다 — `<ul>`이 `shrink-0`을 든다", () => {
    const ul = /<ul className="([^"]*)"/.exec(PAGE.map(code).join("\n"))?.[1] ?? "";
    expect(ul).not.toBe("");
    expect(ul).toContain("shrink-0");
  });

  /**
   * ⚠️ **스크롤이 `PanelBody`로 내려갔다** (2026-09-11 — 패널 레이아웃). 그 전엔 패널이 통째로
   * 스크롤해서 이 화면의 열에 `min-h-0`을 주면 안 됐고(넘친 부분이 패널의 스크롤 영역에 안
   * 들어온다) 이 검사가 그것을 고정했다. 지금은 `PanelBody`가 `min-h-0 flex-1 overflow-y-auto`를
   * **자기가** 들므로 화면이 그 짝을 다시 적을 이유가 없다 — 적으면 두 벌이 되고, 프리미티브가
   * 값을 바꿀 때 한쪽만 낡는다.
   *
   * ⚠️ **`flex-1`도 마찬가지다** — 본문 블록은 `PanelBody`의 `className`으로 `flex flex-col`만
   * 넘긴다. 빈 상태의 세로 중앙 정렬은 그 위에서 성립한다.
   */
  it("본문이 스크롤 규칙을 다시 적지 않는다 — `PanelBody`가 든다", () => {
    expect(PAGE.map(code).join("\n")).toContain("<PanelBody");
    expect(PAGE.map(code).join("\n")).not.toContain("min-h-0");
    expect(PAGE.map(code).join("\n")).not.toContain("overflow-y-auto");
  });
});

/**
 * **Meter의 치수는 시안이 정본이다** (projects-list design §11.3·§11.5).
 *
 * ⚠️ **이전 사이클(`new-project-modal`)에서 같은 캔버스를 주고도 구현이 시안과 갈렸다.** 원인은
 * "비슷한 유틸리티로 옮긴 것"이다 — `gap-2.5`(10)로 `gap 16`을, `rounded-sm`(8)로 `radius 4`를
 * 옮기면 `tsc`도 `pnpm test`도 조용하다. 그래서 리터럴을 **전수로 센다.**
 *
 * ⚠️ **소스 검사만으로는 부족하다** — 클래스가 맞아도 부모의 flex 규칙이 그것을 이긴다
 * (POSTMORTEM 2026-09-11: 게이트 셋과 소스 스캔 여섯이 green인데 입력이 28px였다). 실측은
 * `/design-sync`가 든다.
 */
describe("로케일 Meter — 캔버스 값 그대로", () => {
  const METER = code("components/projects/locale-meter.tsx");

  it.each([
    ["칸 폭 100", "w-25"],
    ["라벨↔바 6", "gap-1.5"],
    ["바 높이 4", "h-1"],
    ["바 radius 999", "rounded-full"],
    ["트랙 8%", "bg-foreground/[0.08]"],
    ["완료 rgba(10,10,10,0.85)", "bg-foreground/85"],
    ["검토 대기 #f59e0b", "bg-amber-500"],
  ])("%s", (_label, literal) => {
    expect(METER).toContain(literal);
  });

  /** 폭만 데이터다 — 나머지 치수를 인라인 스타일로 만들면 그 값이 검사 밖으로 나간다. */
  it("인라인 스타일은 폭 둘뿐이다", () => {
    expect([...METER.matchAll(/style=\{\{/g)]).toHaveLength(2);
    expect(METER).toContain("width: `${done}%`");
    expect(METER).toContain("width: `${review}%`");
  });

  /**
   * ⚠️ **국기는 `LocaleFlag`를 재사용한다** (design §11.35) — 리포에 253개가 이미 있고 치수·radius가
   * 시안과 같다. 새 자산도, 새 매핑도, `rounded-[2px]`도 만들지 않는다.
   */
  it("국기를 새로 만들지 않는다", () => {
    expect(METER).toContain("LocaleFlag");
    expect(METER).not.toContain("rounded-[2px]");
    expect(METER).not.toContain("flagFor");
    expect(METER).not.toContain("/flags/");
  });

  /** ⚠️ **알약(`LocaleBadge`)은 쓰지 않는다** — 배경과 orphaned 갈래가 Meter 라벨에 따라온다. */
  it("LocaleBadge를 쓰지 않는다", () => {
    expect(METER).not.toMatch(/\bLocaleBadge\b/);
  });
});
