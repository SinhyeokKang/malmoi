// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { find, render } from "./helpers/dom";

// 머리의 검색이 `useRouter`를 문다 — 이 스위트가 재는 것은 그릇이고 라우터는 그 길목일 뿐이다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ProjectList } from "@/components/projects/project-list";
import { m } from "@/lib/i18n";
import type { ProjectListRow } from "@/lib/keys/query";

/**
 * **목록의 그릇** — 아트보드 `1a`~`1d` (projects-panel-rework T4·T5·T6·T7).
 *
 * ⚠️ **행(`ProjectRow`)은 재지 않는다** — `project-row.test.tsx`가 이미 든다. 여기가 보는 것은
 * **그룹 헤더가 카드 안에 있나 · 선의 급이 둘인가 · 빈 상태 둘이 같은 카드인가 · Summary가 없나**다.
 *
 * ⚠️ **jsdom은 색을 못 잰다** — `#f0f0f0`과 `#e5e5e5`는 **클래스로** 구별한다. 실제 값은
 * `/design-sync` 4단계가 computed style로 재고, **스크린샷으로 판정하지 않는다**(압축된 PNG에서
 * 두 색이 구별되지 않는데 카드의 읽힘이 그 급 차이에 걸려 있다).
 */

const BASE: ProjectListRow = {
  slug: "admin-console",
  name: "admin-console",
  role: "OWNER",
  installationId: "i",
  surfaces: [{ archivedAt: null, lastCommitSha: "s" }],
  archivedAt: null,
  repoOwner: "day1company",
  repoName: "admin-console",
  repositoryId: "9001",
  memberCount: 6,
  baseBranch: "main",
  lastPrUrl: null,
  reviewSurfaceSlug: null,
  unsentSurfaceSlug: null,
  repoAheadFrom: null,
  meters: [],
  review: 0,
  unsent: 0,
  openPr: null,
  repoAheadFiles: 0,
  importError: null,
  importing: false,
};

/** `1a`의 셋 — 손볼 것 하나 · 정상 하나 · 보관 하나. */
const THREE: ProjectListRow[] = [
  { ...BASE, slug: "chrome-extension", name: "chrome-extension", unsent: 24, unsentSurfaceSlug: "default" },
  BASE,
  { ...BASE, slug: "old-landing", name: "old-landing", archivedAt: new Date("2026-09-01T00:00:00Z") },
];

const draw = async (props: { all?: ProjectListRow[]; q?: string } = {}) => {
  const { container } = await render(<ProjectList all={props.all ?? THREE} q={props.q} />);
  return container;
};

/** 카드는 `<section>`이고 그 안에 헤더와 행 목록이 산다. */
const cards = (container: HTMLElement) => [...container.querySelectorAll("section")];

describe("`1a` 그룹 카드 — 헤더가 카드 안으로 들어온다", () => {
  it("그룹 셋이 카드 셋이고 각 카드가 자기 헤더를 든다", async () => {
    const container = await draw();
    expect(cards(container)).toHaveLength(3);
    expect(cards(container).map((card) => find(card, "h2").textContent)).toEqual([
      m.projects.group.needsAttention,
      m.projects.group.allSet,
      m.projects.archived,
    ]);
  });

  /**
   * 카운트 배지는 그 카드의 행 수다 — 헤더가 목차이므로 숫자도 그 카드의 것이어야 한다.
   *
   * ⚠️ **보이는 숫자와 읽히는 문장을 따로 단언한다.** 숫자만 그리면 접근 이름이 "Needs attention 1"이
   * 되는데, 그것은 **CDP 접근성 트리로 `h2`만 봐도 통과한다**(배지가 별개 노드다). 번역 화면 머리가
   * 같은 자리에서 같은 처방을 쓴다.
   */
  it("카드 헤더가 자기 행 수를 들고, 스크린리더에는 문장을 준다", async () => {
    const container = await draw();
    for (const card of cards(container)) {
      const rows = card.querySelectorAll("li").length;
      const badge = find<HTMLElement>(card, "h2 + span");
      expect(find<HTMLElement>(badge, "[aria-hidden]").textContent).toBe(String(rows));
      expect(find<HTMLElement>(badge, ".sr-only").textContent).toBe(m.projects.count(rows));
    }
  });

  /**
   * ⚠️ **선의 급이 둘이다.** 헤더↔첫 행은 `#f0f0f0`(`border-foreground/[0.06]`), 행↔행은 `#e5e5e5`
   * (`border-border`)다 — 헤더 divider가 행 구분선보다 약해야 "헤더 + 행들"로 읽힌다.
   */
  it("헤더↔첫 행과 행↔행의 선이 다른 급이다", async () => {
    const container = await draw({ all: [THREE[0]!, { ...BASE, unsent: 3 }] });
    const rows = [...find(container, "section").querySelectorAll(":scope > ul > li")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).toContain("border-foreground/[0.06]");
    expect(rows[0]!.className).not.toContain("border-border");
    expect(rows[1]!.className).toContain("border-border");
  });

  /** ⚠️ **행 목록이 `<ul>`로 남는다** — 카드로 감싸면서 list role을 잃으면 스크린리더가 개수를 못 읽는다. */
  it("행이 목록 의미를 유지한다", async () => {
    const container = await draw();
    for (const card of cards(container)) expect(card.querySelector(":scope > ul")).not.toBeNull();
  });

  /** ⚠️ **카드 헤더는 누를 수 없다** — hover도 링크도 없다. */
  it("카드 헤더에 hover도 링크도 없다", async () => {
    const container = await draw();
    for (const card of cards(container)) {
      const head = card.firstElementChild as HTMLElement;
      expect(head.className).not.toContain("hover:");
      expect(head.querySelector("a")).toBeNull();
    }
  });

  /** ⚠️ **카드 바닥에 더 보기 링크를 두지 않는다** — 이 카드는 그룹 전체를 이미 그린다. */
  it("카드 바닥에 더 보기 링크가 없다", async () => {
    const container = await draw();
    for (const card of cards(container)) {
      expect(card.lastElementChild?.tagName).toBe("UL");
    }
  });
});

describe("`1c` 검색 결과 — 결과 카드 하나", () => {
  it("그룹을 그리지 않고 결과 카드 하나가 선다", async () => {
    const container = await draw({ q: "chrome" });
    expect(cards(container)).toHaveLength(1);
    expect(find(container, "section h2").textContent).toBe(m.projects.resultsFor("chrome"));
  });

  /**
   * ⚠️ **제목 옆 총계는 질의에 안 흔들린다** — 그 값이 답하는 질문은 "내 프로젝트가 몇 개인가"다.
   * 카드 카운트만 좁혀진 수를 든다.
   */
  it("제목 배지는 3이고 카드 카운트는 1이다", async () => {
    const container = await draw({ q: "chrome" });
    const total = find<HTMLElement>(container, "h1 + span");
    expect(find<HTMLElement>(total, "[aria-hidden]").textContent).toBe("3");
    expect(find<HTMLElement>(total, ".sr-only").textContent).toBe(m.projects.count(3));
    expect(find<HTMLElement>(container, "section h2 + span [aria-hidden]").textContent).toBe("1");
  });

  /** 나가는 길은 헤더 오른쪽 하나다 — 링크이고 버튼이 아니다. */
  it("헤더 오른쪽에 `Clear search` 링크가 있다", async () => {
    const container = await draw({ q: "chrome" });
    const exit = find<HTMLAnchorElement>(container, "section a");
    expect(exit.textContent).toBe(m.projects.clearSearch);
    expect(exit.getAttribute("href")).toBe("/projects");
  });
});

describe("`1b`·`1d` 빈 상태 둘 — 같은 카드, 반대 출구", () => {
  /** ⚠️ **장식이 패널 안으로 들어오는 예외를 되돌린다** — 다른 블록이 전부 카드인데 한 면만 화려하면 안 된다. */
  it("0건이 카드 하나이고 그라데이션·점 필드가 없다", async () => {
    const container = await draw({ all: [] });
    // 점 필드는 `<canvas>`이고 그라데이션 면은 `from-auth-hero-*` 토큰이다 — 둘 다 자취가 없어야 한다.
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.innerHTML).not.toContain("from-auth-hero-from");
    expect(container.textContent).toContain(m.projects.empty.title);
    expect(container.textContent).toContain(m.projects.empty.description);
  });

  /** ⚠️ **머리가 검색·[New project]를 그리지 않는다**(`hasProjects === false`). 배지 `0`은 남는다. */
  it("0건의 머리가 제목과 배지 0뿐이다", async () => {
    const container = await draw({ all: [] });
    expect(find<HTMLElement>(container, "h1 + span [aria-hidden]").textContent).toBe("0");
    expect(container.querySelector("input")).toBeNull();
  });

  /** 프로젝트가 없을 때의 출구는 **만들기**다 — 채운 버튼 하나. */
  it("0건의 출구가 [New project] 하나다", async () => {
    const container = await draw({ all: [] });
    const links = [...container.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/projects/new");
    expect(links[0]!.textContent).toContain(m.common.nav.newProject);
  });

  /** 검색이 빈 것의 출구는 **되돌리기**다 — 링크이고 채운 버튼이 아니다. */
  it("검색 0건이 제목에 질의를 싣고 출구가 링크다", async () => {
    const container = await draw({ q: "stripe" });
    expect(cards(container)).toHaveLength(0);
    expect(container.textContent).toContain(m.projects.narrowed.title("stripe"));
    expect(container.textContent).toContain(m.projects.narrowed.description);
    const exit = [...container.querySelectorAll("a")].filter((a) => a.getAttribute("href") === "/projects");
    expect(exit).toHaveLength(1);
    expect(exit[0]!.textContent).toBe(m.projects.narrowed.reset);
  });

  /**
   * ⚠️ **둘이 한 갈래로 합쳐지지 않는다** — 출구의 무게가 반대다. 합치면 그 차이를 그리는 자리가 사라진다.
   */
  it("0건과 검색 0건이 다른 제목을 낸다", async () => {
    expect((await draw({ all: [] })).textContent).not.toContain(m.projects.narrowed.description);
    expect((await draw({ q: "stripe" })).textContent).not.toContain(m.projects.empty.description);
  });
});

describe("Summary 넷이 화면에서 사라진다", () => {
  /**
   * ⚠️ **`summaryQueue`와 raw ④는 지우지 않는다** — `project-home`이 그 소비자가 된다
   * (`spec.md` §5). 여기서 재는 것은 **화면**이지 집계가 아니다.
   */
  it.each([
    m.projects.summary.newFromGithub,
    m.projects.summary.toTranslate,
    m.projects.summary.toReview,
    m.projects.summary.toSend,
  ])("`%s`가 목록 화면에 없다", async (label) => {
    expect((await draw()).textContent).not.toContain(label);
  });
});

describe("보관 행이 한 단계 더 물러난다", () => {
  /** 보관 카드의 유일한 행을 집는다 — 그룹 순서는 위 `1a` 테스트가 이미 고정한다. */
  const archivedRow = (container: HTMLElement) => find<HTMLElement>(cards(container)[2]!, "li");
  const activeRow = (container: HTMLElement) => find<HTMLElement>(cards(container)[1]!, "li");
  const nameOf = (row: HTMLElement) => find<HTMLElement>(row, "span.text-base");
  const metaOf = (row: HTMLElement) => find<HTMLElement>(row, "span.text-sm.truncate");

  /**
   * ⚠️ **이름·메타·배지가 `#a3a3a3` 한 색이다** (2026-09-20 사용자 — *"거의 비활성 상태에 가깝게"*).
   * 전에는 셋 다 `#737373`이었는데 그 값은 이 리포에서 **꺼진 컨트롤의 글자색**이라 더 내려갈 데가
   * 없었다. 한 단계 아래인 `neutral-400`을 이 행에 들이는 것이 그 요청의 답이다.
   *
   * ⚠️ **셋이 함께 움직여야 한다** — 하나라도 남으면 그것이 행에서 가장 진한 것이 되어 눈이 먼저 간다.
   */
  it("이름·메타·배지가 전부 neutral-400이다", async () => {
    const row = archivedRow(await draw());
    expect(nameOf(row).className).toContain("text-neutral-400");
    expect(metaOf(row).className).toContain("text-neutral-400");
    const badge = find<HTMLElement>(row, "span.rounded-full");
    expect(badge.textContent).toBe(m.projects.archived);
    expect(badge.className).toContain("text-neutral-400");
  });

  /** ⚠️ **살아 있는 행은 안 움직인다** — 이름은 `#0a0a0a`, 메타는 `#737373` 그대로다. */
  it("보관이 아닌 행의 색은 그대로다", async () => {
    const row = activeRow(await draw());
    expect(nameOf(row).className).not.toContain("text-neutral-400");
    expect(nameOf(row).className).not.toContain("text-muted-foreground");
    expect(metaOf(row).className).toContain("text-muted-foreground");
    expect(metaOf(row).className).not.toContain("text-neutral-400");
  });
});
