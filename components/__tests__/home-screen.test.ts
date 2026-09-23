import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Home(`/projects/:slug`)의 배선을 **소스에서** 센다 (6b-6).
 *
 * ⚠️ 이 화면에는 지켜야 할 것이 둘 있고 **둘 다 렌더 테스트가 없는 층**이다:
 *
 * 1. **착지 클릭 하나를 갚는다** (PRODUCT §7.7 결정 1이 받아들인 대가). 번역자의 일은 `translations`
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

describe("Home — 개요가 일로 이어진다 (project-home)", () => {
  const src = read(HOME);

  it("게이트가 `translation:write`다 — 번역자가 착지하는 화면이다", () => {
    expect(src).toContain("requireProjectAccess");
    expect(src).toMatch(/permission:\s*"translation:write"/);
  });

  /**
   * ⚠️ **블록 셋 + 메타 열이다** (DESIGN §6.64). `Languages` 블록과 `[Open translations]` primary가
   * 사라졌다 — 카드 넷이 그 자리를 받고, 각 카드가 자기 구간으로 착지시킨다.
   */
  it("카드 넷 · 항목 · 로그 · 메타 열 넷을 그린다", () => {
    for (const block of ["CountCards", "AttentionCard", "LogsCard", "MetaColumn"]) {
      expect(src, block).toContain(block);
    }
  });

  it("`Languages` 블록과 `[Open translations]` primary가 없다", () => {
    expect(src).not.toMatch(/m\.home\.progress/);
    expect(src).not.toMatch(/openTranslations/);
  });

  /**
   * ⚠️ **판정을 화면이 하지 않는다** (DESIGN §6.64). 여섯 상태 × 화면 요소의 매트릭스를 JSX의 `&&`에
   * 흩으면 테스트가 전수로 들 자리가 없다.
   */
  it("순수 판정 다섯을 `lib/home/*`에서 받는다", () => {
    // ⚠️ **`recentActivity`가 2026-09-20에 빠졌다** (logs-rework) — 활동 조합이 사라지고 Home도
    // `lib/events/query.ts`의 같은 스트림을 읽는다. 아래 `loadEvents` 검사가 그 자리를 대신한다.
    for (const fn of ["planHomeState(", "countCards(", "attentionItems(", "metaRows("]) {
      expect(src, fn).toContain(fn);
    }
  });

  /**
   * ⚠️ **미발송 술어의 넷째 벌을 만들지 않는다** (CLAUDE.md). 카드 넷의 수는 `summaryQueue` 하나에서
   * 나오고, `countUnpublished`는 번역 화면 툴바의 것이다.
   */
  it("`summaryQueue`를 쓰고 `countUnpublished`를 부르지 않는다", () => {
    expect(src).toMatch(/summaryQueue\(/);
    expect(src).not.toMatch(/countUnpublished/);
  });

  /**
   * ⚠️ **`archived: false`를 고정으로 넘긴다** — 그 필터는 계정 합계의 것이고 Home은
   * 프로젝트 하나다. 그대로 넘기면 보관하는 순간 카드 넷이 전부 0이 된다.
   */
  it("`summaryQueue`에 보관을 넘기지 않는다", () => {
    expect(src).toMatch(/archived:\s*false/);
  });

  /** ⚠️ 조회가 여섯이다 — 순차로 보내면 도쿄 왕복이 여섯 번 쌓인다 (POSTMORTEM 2026-09-05). */
  it("조회를 한 라운드로 보낸다", () => {
    expect(src).toMatch(/Promise\.all\(/);
  });

  /**
   * ⚠️ **`[Sync]`가 `runRepositoryImport`를 부른다** — 그 Action은 자기를 부른 페이지 세그먼트의
   * `maxDuration`을 쓰고, 없으면 큰 리포에서만 실패한다 (sync-repository T9-1).
   */
  it("`maxDuration`을 명시한다", () => {
    expect(src).toMatch(/export const maxDuration = 60/);
  });

  /** 진행률은 6b-5의 판정을 그대로 쓴다 — `loadKeys`는 행마다 셀과 refs를 들고 와 903키에서 무겁다. */
  it("`loadKeys`를 부르지 않는다", () => {
    expect(src).not.toMatch(/loadKeys\(/);
  });
});

/**
 * **프로젝트 루트 링크가 Home을 가리킨다** (PRODUCT §7.7 결정 1 — 진입의 착지점).
 *
 * ⚠️ 6b-6 전까지 이 자리들은 전부 `routes.translations(slug)`였다. 하나라도 남으면 **같은
 * "프로젝트로 간다"가 어디서 눌렀는지에 따라 다른 곳에 착지하고**, 그 불일치는 눈에 안 보인다.
 */
describe("프로젝트 루트 링크는 `routes.project`다 (6b-6)", () => {
  /**
   * 프로젝트 하위 화면 다섯 — **breadcrumb이 있던 자리들**이다.
   *
   * ⚠️ **8-4가 그 breadcrumb 다섯을 전부 지웠다** (DESIGN §0). 그래서 이 목록은 더 이상 "루트 링크를
   * 드는 자리"가 아니라 **"루트 의미로 번역 화면을 가리키면 안 되는 자리"**의 목록이다 — 아래
   * 부정 단언이 그 축이고, 긍정 단언의 대상은 `ROOT_LINK_SITES` 둘로 줄었다.
   */
  const SITES = [
    // 목록 본문은 `components/projects/project-list.tsx`로 내려갔다 (new-project-modal T8).
    "components/projects/project-list.tsx",
    "components/translations/workspace/workspace.tsx",
    "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx",
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
  const ROOT_LINK_SITES = ["components/projects/project-list.tsx", "lib/shell/nav.ts"];

  it("두 자리가 전부 `routes.project`를 쓴다", () => {
    for (const path of ROOT_LINK_SITES) {
      expect(read(path), path).toMatch(/routes\.project\(/);
    }
  });

  /**
   * ⚠️ **breadcrumb이 하나도 안 남았다** (8-4 — DESIGN §0) — 번역 화면에서만 떼면 형제 라우트 넷과
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

/**
 * ⚠️ **결과·진행 상태는 프로젝트 단위다** (sync-repository handoff §T9 — *"다른 프로젝트로 이동할
 * 때는 프로젝트 단위로 상태를 분리한다"*). `[slug]`는 **param만 바뀌는 같은 세그먼트**라 React가
 * `HomeActions`를 같은 자리로 화해시킨다 — `key`가 없으면 A에서 낸 결과 Alert가 **A의 브랜치
 * 이름을 단 채로** B의 Home에 남고, 진행 중 잠금도 함께 넘어온다. 셸 LNB의 전환으로 닿는다.
 *
 * ⚠️ **렌더 테스트로 세지 않는다** — 테스트가 `key`를 직접 넘기면 React의 동작만 확인하고 **이
 * 페이지가 그것을 넘겼는지는 안 본다**(공허하게 green인 부류다). 세는 것은 배선이다.
 */
it("Home이 HomeActions를 프로젝트 단위로 분리한다", () => {
  const source = read("app/(edit)/projects/[slug]/page.tsx");
  expect(source).toMatch(/<HomeActions\s+key=\{/);
});

/**
 * 로딩 골격(캔버스 `2e`)이 실물과 같은 자리·같은 높이를 그리는지 **소스에서** 센다.
 *
 * ⚠️ **렌더 테스트로는 못 센다** — jsdom에 레이아웃이 없어 모든 rect가 `0×0`이라, "도착하는 순간
 * 튀지 않는다"는 이 파일의 존재 이유가 통째로 측정 불가다. 브라우저 실측은 실물 Home 쪽에서 했고
 * (2026-09-16 · `docs/DESIGN.md` §6.64), 여기가 막는 것은 **그 값이 다시 지워지는 것**이다.
 *
 * ⚠️ **`2e` 화면 자체는 아직 못 밟았다** — soft navigation은 이전 화면을 유지하고, hard navigation은
 * `(edit)` 레이아웃이 shell을 잡고 있어 fallback 창이 안 열렸다(임시 지연 5초로도 안 떴다).
 */
describe("로딩 골격이 실물의 치수를 든다 (2026-09-16 실측)", () => {
  const skeleton = () => read("app/(edit)/projects/[slug]/loading.tsx");

  it("메타 열은 구역이 둘이고 바닥에 링크가 있다", () => {
    const source = skeleton();
    // 한 구역 아홉 행이면 경계 하나와 `[Project settings ›]` 45px이 통째로 빠진다.
    expect(source.match(/<MetaGroup rows=\{\d+\}/g)).toHaveLength(2);
    expect(source).toMatch(/<FooterLink \/>\s*<\/aside>/);
  });

  it("행 높이는 블록이 아니라 컨테이너가 든다", () => {
    const source = skeleton();
    // 할 일 행은 두 줄(42) · 로그 행은 한 줄(22) · 메타 행은 `text-sm`의 20이다.
    expect(source).toMatch(/h-\[42px\]/);
    expect(source).toMatch(/h-\[22px\]/);
    expect(source).toMatch(/flex h-5 items-center/);
    expect(source).toMatch(/flex h-\[45px\] items-center/);
  });

  it("할 일 카드에는 바닥 링크가 없고 로그 카드에는 있다", () => {
    const source = skeleton();
    expect(source).toMatch(/<Card rows=\{3\} footer=\{false\} \/>/);
    expect(source).toMatch(/<Card rows=\{5\} footer divided=\{false\} \/>/);
  });
});

/**
 * **Home의 Recent logs가 Logs와 같은 스트림을 읽는다** (logs-rework T8a·T8b·T8c).
 *
 * ⚠️ **소스로 센다** — 같은 사건이 두 화면에서 같은 ID·같은 상세여야 한다는 성질은 렌더 테스트가
 * 못 본다(둘을 같은 테스트에서 세우지 않는다). 조합 쿼리가 되살아나는 것도 마찬가지다.
 */
describe("Home — 활동은 이벤트 스트림 하나다", () => {
  const src = read("app/(edit)/projects/[slug]/page.tsx");

  it("조합 쿼리와 7일 창이 소스에서 사라졌다", () => {
    for (const gone of ["recentActivity(", "ACTIVITY_WINDOW_DAYS", "ACTIVITY_LIMIT", "loadRecentEdits", "loadRecentPublishes", "loadLastSyncNewKeys"]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it("Logs와 같은 조회를 `HOME_EVENT_LIMIT`으로 부른다 — 같은 수를 두 번 세지 않는다", () => {
    expect(src).toContain("loadEvents(");
    expect(src).toContain("HOME_EVENT_LIMIT");
  });

  /** ⚠️ **all-or-nothing이다** (결정 16) — 실패를 빈 카드로 접으면 "활동이 없다"가 거짓이 된다. */
  it("조회를 `try`로 감싸지 않는다", () => {
    const body = src.slice(src.indexOf("const [aggregates"), src.indexOf("const actors"));
    expect(body).not.toMatch(/\btry\s*\{/);
  });

  it("`?event=`를 받아 Home 위에서 상세를 연다 — Logs로 튕기지 않는다", () => {
    expect(src).toContain("searchParams");
    expect(src).toContain("EventDialog");
    expect(src).toContain("routes.project(slug)");
    // 카드의 행은 Home으로 돌아오는 링크를 낸다.
    expect(read("components/home/logs-card.tsx")).toContain("routes.project(slug, { event: row.ref })");
  });

  it("카드가 Logs와 **같은 행 컴포넌트**를 쓴다 — 같은 사건이 두 모양이 되지 않는다", () => {
    expect(read("components/home/logs-card.tsx")).toContain('from "@/components/logs/event-row"');
  });
});
