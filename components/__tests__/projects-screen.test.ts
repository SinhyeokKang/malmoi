import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 프로젝트 목록 화면의 배선을 **소스로** 센다 (8-3 — `translations-screen`·`home-screen`과 같은 계보).
 * 렌더 테스트가 없는 리포라 이 층이 방어선이다.
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

/**
 * ⚠️ **그릇이 프리미티브로 올라갔다** (members-rework T5). 카드·행 목록·행·띠·빈 상태가
 * `components/ui/row-card.tsx`에 살고 멤버 화면이 같은 것을 쓴다 — `rounded-lg`·`p-4`·
 * `border-foreground/[0.06]`·`@container`·`pl-14`처럼 **옮겨간 리터럴**을 이 스위트가 계속 세려면
 * 읽는 자리가 둘이어야 한다. 합쳐 읽는 쪽이 낫다: 어느 파일이 들든 규칙은 이 화면에 여전히 적용되고,
 * 부정 단언(`divide-y` 없음 등)은 **넓어진다**.
 */
const ROW_CARD = "components/ui/row-card.tsx";
const LIST_AND_CARD = [code("components/projects/project-list.tsx"), code(ROW_CARD)].join("\n");

describe("프로젝트 목록 — 필터는 URL이고 클라이언트 상태가 아니다", () => {
  /**
   * ⚠️ **세그먼트를 `useState`로 만들면 뒤로가기·공유·새로고침이 전부 깨진다.** `logs`의 `?cursor=`가
   * 같은 판정이고(DESIGN §6.68), 서버가 이미 필터된 목록을 그리므로 클라이언트 상태가 0이어야 한다.
   */
  it("페이지가 클라이언트 컴포넌트가 아니다", () => {
    expect(PAGE.map(code).join("\n")).not.toContain('"use client"');
    expect(PAGE.map(code).join("\n")).not.toContain("useState");
  });

  /**
   * ⚠️ **필터 축이 사라졌다** (DESIGN §6.63). 좁히는 것은 `?q=` 하나이고, 옛 `?filter=`는
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
    expect(src).toContain("STATUS_CHIP[status]");
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
    const map = /const STATUS_CHIP = \{([\s\S]*?)\n\} as const/.exec(PAGE.map(code).join("\n"))?.[1] ?? "";
    expect(map).not.toBe("");
    expect(map).toMatch(/archived:\s*\{ variant: "neutral"/);
    expect(map).toMatch(/active:\s*\{ variant: "success"/);
    /**
     * ⚠️ **온보딩 중인 둘은 amber가 아니다** (2026-09-11 사용자). 새 프로젝트가 지나가는 정상
     * 경로이고 시간이 지나면 저절로 `Active`가 된다 — amber로 칠하면 고장난 것처럼 보인다.
     */
    expect(map).toMatch(/setup:\s*\{ variant: "neutral"/);
    expect(map).toMatch(/awaiting_first_sync:\s*\{ variant: "neutral"/);
    /** ⚠️ **한때 돌던 것이 멈춘 것**이라 사람이 손대야 풀린다 — amber가 여기 하나만 남았다. */
    expect(map).toMatch(/needs_reconnect:\s*\{ variant: "warning"/);
  });

  /**
   * ⚠️ **무색 배지의 글자색이 셋으로 갈린다**: 보관은 **`#a3a3a3`**(2026-09-20 — 이름·메타와 한 색으로
   * 내려갔다, DESIGN §6.63), 온보딩 중인 둘은 `#525252`, 총계·그룹 카운트는 foreground 그대로다.
   * `Badge neutral`의 기본이 foreground이므로 **호출부에서 내린다** — 프리미티브를 바꾸면 이 루프가
   * 보지 않은 화면의 배지가 함께 움직인다.
   */
  it("무색 배지의 글자색을 호출부가 내린다", () => {
    const map = /const STATUS_CHIP = \{([\s\S]*?)\n\} as const/.exec(PAGE.map(code).join("\n"))?.[1] ?? "";
    expect(map).toMatch(/archived:[^\n]*tone: "text-neutral-400"/);
    expect(map).toMatch(/setup:[^\n]*tone: "text-neutral-600"/);
    expect(map).toMatch(/awaiting_first_sync:[^\n]*tone: "text-neutral-600"/);
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
  /**
   * ⚠️ **2026-09-15에 그 자리가 `<section>`으로 옮겨졌다** — 그룹 헤더가 카드 안으로 들어오면서
   * `PanelBody`의 flex 자식이 `<ul>`이 아니라 카드가 됐다. **불변식은 그대로이고 요소만 바뀐다.**
   */
  it("목록이 축소되지 않는다 — 카드가 `shrink-0`을 든다", () => {
    const card = /<section className="([^"]*)"/.exec(LIST_AND_CARD)?.[1] ?? "";
    expect(card).not.toBe("");
    expect(card).toContain("shrink-0");
    expect(card).toContain("overflow-hidden");
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
 * **Meter의 치수는 시안이 정본이다** (DESIGN §6.63).
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
  const METER = code("components/locale-meter.tsx");

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
   * ⚠️ **국기는 `LocaleFlag`를 재사용한다** (DESIGN §6.63) — 리포에 253개가 이미 있고 치수·radius가
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

/**
 * **목록 본문의 치수는 시안이 정본이다** (DESIGN §6.63).
 *
 * ⚠️ **주석을 벗기고 센다** — 이 파일 위쪽의 `code()`가 그 일을 한다. 주석이 자기가 피하는 것을
 * 리터럴로 적는 부류라, 안 벗기면 주석만으로 green이 된다.
 */
describe("목록 본문 — 캔버스 값 그대로", () => {
  const BODY = LIST_AND_CARD;

  it.each([
    ["이름 칸 420", "w-[420px]"],
    ["행 요소 gap 16", "gap-4"],
    ["행 padding 14/14/12", "py-3.5"],
    ["행 hover 2%", "hover:bg-foreground/[0.02]"],
    ["헤더↔첫 행 hairline #f0f0f0", "border-foreground/[0.06]"],
    ["띠 좌측 들여쓰기 56", "pl-14"],
    ["Meter 대체 문장 332", "w-[332px]"],
    ["카드 radius 12", "rounded-lg"],
    ["카드 헤더 padding 16", "p-4"],
    ["카드 헤더 15/500", "text-base font-medium"],
    ["본문 카드 사이 16", "gap-4"],
  ])("%s", (_label, literal) => {
    expect(BODY).toContain(literal);
  });

  /**
   * ⚠️ **radius가 8이고 캔버스의 4가 아니다** (2026-09-17 사용자) — 초대 카드(§6.4)까지 세 화면을
   * 한 값으로 모은 판정이다. 근거는 DESIGN §6.63의 이탈 표에 있다.
   */
  it("행 글리프 radius 8은 공통 프로젝트 썸네일이 소유한다", () => {
    expect(BODY).toContain("<ProjectThumbnail name={row.name}");
    expect(code("components/projects/project-thumbnail.tsx")).toContain("rounded-sm");
  });

  /**
   * ⚠️ **`divide-y`를 쓰면 띠와 행 사이에도 `#e5e5e5` 선이 생긴다.** 시안은 거기가 `#f0f0f0`이고
   * 행 사이만 `#e5e5e5`다 — 행마다 `border-t`를 직접 준다(첫 행 제외).
   */
  it("`divide-y`를 쓰지 않는다", () => {
    expect(BODY).not.toContain("divide-y");
    expect(BODY).not.toContain("divide-border");
  });

  /** ⚠️ **행 hover는 2%다** — 3%로 두면 시안보다 진하다. */
  it("옛 hover 3%가 남아 있지 않다", () => {
    expect(BODY).not.toContain("hover:bg-foreground/[0.03]");
  });

  /**
   * ⚠️ **Summary 넷이 목록 화면에서 사라진다** (DESIGN §6.63). 계정 합계는 "어느
   * 프로젝트를 열지"에 쓰이지 않고, 같은 값을 프로젝트별로 쪼갠 것이 이미 행의 Meter와 아래 띠다.
   *
   * ⚠️ **`summaryQueue`·raw ④·`m.projects.summary.*`는 지우지 않는다** — `project-home`이 받는다
   * (`spec.md` §5). 여기서 재는 것은 **목록 경로**뿐이다.
   */
  it("목록이 Summary를 그리지 않는다", () => {
    expect(BODY).not.toContain("SummaryRow");
    expect(BODY).not.toContain("SummaryQueue");
    expect(BODY).not.toContain("m.projects.summary");
    expect(BODY).not.toContain("view.summary");
  });

  /** ⚠️ **본문의 갈래를 `listBody` 하나가 정한다** — 화면이 `hasProjects`·질의·건수를 다시 섞지 않는다. */
  it("본문 갈래를 `listBody`가 정한다", () => {
    expect(BODY).toContain("listBody(all, q)");
    expect(BODY).not.toContain("const hasProjects");
  });

  /**
   * ⚠️ **띠는 행의 형제다** — `<a>` 안에 넣으면 링크가 중첩되고, 그 안의 [Review]는 누를 수 없다.
   */
  it("띠가 행 링크 밖에 있다", () => {
    expect(BODY).toMatch(/<\/Link>\s*\n\s*\{banner !== null && <ProjectBanner/);
  });

  it("그룹 헤더 셋을 사전에서 가져온다 — 배지 낱말과 두 벌이 되지 않는다", () => {
    expect(BODY).toContain("m.projects.group.needsAttention");
    expect(BODY).toContain("m.projects.group.allSet");
    expect(BODY).toContain("archived: m.projects.archived");
  });

  it("띠 갈래를 `rowBanner`가 정한다 — 화면이 상태를 다시 판정하지 않는다", () => {
    expect(BODY).toContain("rowBanner(row)");
    expect(BODY).toContain("meterSlot(row, row.meters)");
    expect(BODY).toContain("listBody(all, q)");
  });

  /**
   * ⚠️ **역할로 갈리는 것은 링크 둘과 문장 하나다** (DESIGN §6.63) — `project:settings` 뒤라 EDITOR에게
   * 보여 주면 눌러서 거절당하는 경험이 된다. 가져오기 실패의 `View details`는 Sources로 가서 EDITOR도 받고(audit #6 r1),
   * 재시도가 OWNER 몫이라는 문장만 갈린다. 판정은 **호출부**가 하고 `rowBanner`는 역할을 안 받는다.
   */
  it("두 링크와 재시도 문장이 `project:settings`로 갈린다", () => {
    expect(BODY).toContain('canPerform(row.role, "project:settings")');
    expect(BODY).toContain("m.projects.banner.askOwner.reconnect");
    expect(BODY).toContain("m.projects.banner.askOwner.setup");
    expect(BODY).toContain("m.projects.importFailure.ownerRetries");
  });

  /**
   * ⚠️ **외부 링크에 글리프를 달지 않는다** (2026-09-18 사용자 판정 — DESIGN §6.3).
   * 나가는 신호는 색과 새 탭이 들고, 아이콘은 띠 한 줄에서 자리만 먹었다. Home 리포 행이
   * 2026-09-16에 먼저 뺐고 나머지 열이 그 뒤를 따랐다 — **예외를 다시 만들지 않는다.**
   */
  it("외부 링크가 새 탭을 열되 글리프를 달지 않는다", () => {
    expect(BODY).toContain('target="_blank"');
    expect(BODY).toContain('rel="noreferrer"');
    expect(BODY).not.toContain("ExternalLink");
  });

  /** ⚠️ **`main`을 하드코딩하지 않는다** — 실제 base 브랜치 이름이 문구와 링크에 들어간다. */
  it("compare 링크와 문구가 base 브랜치를 쓴다", () => {
    expect(BODY).toContain("row.baseBranch");
    expect(BODY).not.toMatch(/compare\/[^`]*\.\.\.main/);
  });
});

/**
 * **스켈레톤이 실물 골격을 따라간다** (DESIGN §6.63).
 *
 * ⚠️ **이 화면은 GitHub을 기다린다** (DESIGN §6.63) — 스켈레톤이 서 있는 시간이 전보다 길어졌고,
 * 골격이 실물과 어긋나면 그만큼 오래 어긋나 보인다. 데이터가 도착하는 순간의 튐이 로딩 표시보다
 * 더 눈에 띈다.
 */
describe("목록 스켈레톤 — 실물과 같은 골격", () => {
  const SKELETON = code("app/(edit)/projects/loading.tsx");

  it.each([
    ["본문 카드 사이 16", "gap-4"],
    ["카드 헤더 hairline", "border-foreground/[0.06]"],
    ["이름 칸 420", "w-[420px]"],
    ["행 글리프 radius 4", "rounded-[4px]"],
    ["행 gap 16", "gap-4"],
  ])("%s가 실물과 같다", (_label, literal) => {
    expect(SKELETON).toContain(literal);
  });

  /**
   * 카드 헤더 하나 + 행 둘.
   *
   * ⚠️ **Summary 줄이 사라진다** — 골격이 실물보다 90px 길면 데이터가 도착하는 순간 목록이 그만큼 튄다.
   */
  it("카드 헤더와 행 둘을 그리고 Summary 줄이 없다", () => {
    expect(SKELETON).toContain("[0, 1].map");
    expect(SKELETON).not.toContain("[0, 1, 2, 3].map");
    expect(SKELETON).not.toContain("w-50");
  });

  /** ⚠️ **선이 스켈레톤에도 있다** — 뒤늦게 생기면 본문이 1px 밀린다. 그 선은 프리미티브가 든다. */
  it("머리 여백·선을 프리미티브에 맡긴다", () => {
    expect(SKELETON).not.toMatch(/<PanelHeader[^>]*\b(px|py|pt|pb)-\d/);
    expect(SKELETON).not.toMatch(/<PanelBody[^>]*\b(px|py|pt|pb)-\d/);
  });

  /**
   * ⚠️ **움직임을 줄인 사용자에게는 정지한 회색 블록이다.** 그 `motion-safe:`는 이제 `Skeleton` 프리미티브가
   * 든다(audit #49 — 로컬 `Block`이 같은 클래스를 손으로 들었다). 프리미티브 쪽은 `skeleton.test.tsx`가 센다.
   */
  it("회색 블록이 `Skeleton` 프리미티브다", () => {
    expect(SKELETON).toContain("<Skeleton ");
    expect(SKELETON).not.toContain("animate-pulse");
  });

  /** ⚠️ **스크린리더가 회색 블록을 읽지 않는다** — 머리와 본문 둘 다 가린다. */
  it("머리와 본문이 각각 `aria-hidden`이다", () => {
    expect([...SKELETON.matchAll(/aria-hidden/g)]).toHaveLength(2);
  });

  it("옛 `divide-y` 골격이 남아 있지 않다", () => {
    expect(SKELETON).not.toContain("divide-y");
  });
});

/**
 * **폭 축소는 컨테이너 쿼리다** (DESIGN §6.63).
 *
 * ⚠️ **뷰포트 브레이크포인트로는 영영 안 밟힌다.** 셸이 `min-w-[1280px]`을 들어 가로 스크롤이 먼저
 * 생기고, 패널 폭은 같은 뷰포트에서도 **LNB 리사이즈(200~320)**로 두 값이 된다 — 실제로 변하는 것은
 * 카드 폭이다. (2026-09-16까지 근거가 '오른쪽 패널 유무'였고 그 패널을 지웠다 — DESIGN §6.55.)
 */
describe("Meter 폭 축소 — 컨테이너 기준", () => {
  const BODY = LIST_AND_CARD;

  it("카드가 컨테이너다", () => {
    expect(BODY).toMatch(/<ul[^>]*className="[^"]*@container/);
  });

  it.each([
    ["1120 미만에서 셋째를 숨긴다", "@max-[1120px]:[&>*:nth-child(n+3)]:hidden"],
    ["940 미만에서 둘째를 숨긴다", "@max-[940px]:[&>*:nth-child(n+2)]:hidden"],
    ["760 미만에서 묶음을 숨긴다", "@max-[760px]:hidden"],
  ])("%s", (_label, literal) => {
    expect(BODY).toContain(literal);
  });

  /** ⚠️ **뷰포트 variant를 쓰지 않는다** — `lg:`·`xl:`이 섞이면 그 축이 영영 안 밟힌다. */
  it("뷰포트 브레이크포인트를 쓰지 않는다", () => {
    expect(BODY).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
  });

  /**
   * ⚠️ **대체 문장은 `shrink-0`으로 되돌리지 않는다** (DESIGN §6.63). Meter 개수만 줄여 놓고 문장을
   * 고정 폭으로 두면 좁은 화면에서 그 문장이 우측 배지를 밀어낸다.
   */
  it("Meter 대체 문장이 줄어들 수 있다", () => {
    expect(BODY).toContain('className="text-muted-foreground w-[332px] min-w-0 shrink truncate text-sm"');
  });
});

/**
 * **캔버스 대조(2026-09-13 `/design-sync` 1차)가 잡은 다섯을 고정한다.**
 *
 * 전부 `pnpm test` 3,300개가 green인 채로 시안과 갈려 있던 자리다 — 값이 맞고 **표현만** 틀린 부류는
 * 단위 테스트가 원리적으로 못 본다. 실측은 그때 한 번이고 이 검사는 다음에도 돈다.
 */
describe("캔버스 대조로 잡은 자리", () => {
  const BODY = LIST_AND_CARD;
  const EMPTY = [code("components/projects/empty-projects.tsx"), code(ROW_CARD)].join("\n");

  /**
   * ⚠️ **빈 상태가 카드 규격으로 내려온다** (캔버스 `1b`). 다른 블록이 전부 `border 1 · radius 12 ·
   * 흰 배경`인데 한 면만 그라데이션 + 점 필드 + KV면 **빈 상태가 화면 중 가장 화려해진다.**
   * 원칙 5(장식은 패널 안에 살지 않는다)의 예외를 **되돌리는** 판단이다.
   */
  it("0건 빈 상태에서 장식이 사라진다", () => {
    expect(EMPTY).not.toContain("KeyVisual");
    expect(EMPTY).not.toContain("DotField");
    expect(EMPTY).not.toContain("from-auth-hero-from");
    // 셸 밖 규격(40 · radius 12)에서 셸 안 규격(36 · radius 10)으로 내려온다.
    expect(EMPTY).not.toContain('size="lg"');
  });

  /** 아이콘 칩 36 · radius 8 · 제목 15/500 · 설명 14/1.6 46ch (캔버스 `1b`). */
  it.each([
    ["아이콘 칩 36", "size-9"],
    ["칩 radius 8", "rounded-sm"],
    ["제목 15/500", "text-base font-medium"],
    ["설명 46ch", "max-w-[46ch]"],
    ["카드 radius 12", "rounded-lg"],
  ])("빈 상태 카드 — %s", (_label, literal) => {
    expect(EMPTY).toContain(literal);
  });

  /**
   * ⚠️ **보관은 이름까지 회색이다** — 숨기지 않는 대신 훑는 눈에서만 멀어진다.
   *
   * ⚠️ **그 회색이 `#a3a3a3`이다** (2026-09-20 사용자 — *"거의 비활성 상태에 가깝게"*). `#737373`은
   * 이 리포에서 꺼진 컨트롤의 글자색이라 더 내려갈 데가 없었다. **메타도 같은 값으로 따라간다** —
   * 색을 재는 렌더 단언은 `projects-cards.test.tsx`에 있고, 여기서는 갈래가 상태에 묶여 있는지를 센다.
   */
  it("보관 행의 이름과 메타가 neutral-400이다", () => {
    expect(BODY).toContain('status === "archived" && "text-neutral-400"');
    expect(BODY).toContain('status === "archived" ? "text-neutral-400" : "text-muted-foreground"');
  });

  /**
   * ⚠️ **일치 구간은 이름에서만 칠한다** — `searchProjects`의 대상이 이름 하나라, 리포 줄까지
   * 칠하면 화면이 실제보다 넓게 찾은 것처럼 말한다.
   */
  it("검색 일치를 이름 칸에서만 칠한다", () => {
    expect(BODY).toContain("highlightName(row.name, q)");
    expect(BODY).toContain("rounded-[3px] bg-blue-600/[0.14] px-px");
    // 메타 줄은 원문 그대로다.
    expect(BODY).toMatch(/\$\{row\.repoOwner\}\/\$\{row\.repoName\}/);
  });

  /**
   * ⚠️ **결과 줄이 카드 헤더가 됐다** (캔버스 `1c`). 문장에 수를 두면 카운트 배지와 두 번 말하므로
   * `searchResult(n, total)`은 사라지고 `resultsFor(q)`가 그 자리를 든다.
   */
  it("결과가 카드 헤더이고 옛 결과 줄이 없다", () => {
    expect(BODY).toContain("m.projects.resultsFor(");
    expect(BODY).not.toContain("m.projects.searchResult");
    expect(BODY).toContain("m.projects.clearSearch");
  });
});
