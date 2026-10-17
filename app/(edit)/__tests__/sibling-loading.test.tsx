// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";

import { LocaleMeter } from "@/components/locale-meter";
import { SOURCE_CONTENT_STACK, SOURCE_STATUS_STACK } from "@/components/sources/row-layout";

import AccountLoading from "../account/loading";
import LogsLoading from "../projects/[slug]/logs/loading";
import MembersLoading from "../projects/[slug]/members/loading";
import SettingsLoading from "../projects/[slug]/settings/loading";
import SourcesLoading from "../projects/[slug]/sources/loading";
import TranslationsLoading from "../projects/[slug]/surfaces/[surfaceSlug]/translations/loading";

vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

/**
 * **`[slug]` 아래 형제 화면이 각자 골격을 든다** (audit-ux #5 · DESIGN §6.64 로딩 행). 없으면 Home·Logs에서, 또
 * 형제끼리 이동하는 동안 옛 화면이 표시 없이 멈춘다 — 위쪽 경계는 공유 레이아웃보다 위라 다시 서지 않는다.
 *
 * ⚠️ **`loading.tsx`는 테스트가 0이던 자리다** (POSTMORTEM 2026-09-16) — 골격이 실물과 떠내려가도 아무도 모른다.
 * 여기서 세는 것은 **골격 계약**(패널을 안 든다 · 낭독 한 줄 · 나머지는 `aria-hidden`)과 **줄 수**다. 치수 자체는
 * computed style이라 jsdom이 못 본다 — `/runtime-test`가 스로틀로 밟는다.
 */
const ROOT = join(__dirname, "..");
const SCREENS = [
  // `/account`는 `[slug]` 형제가 아니지만 같은 골격 계약이다(4-Y17 — 낭독 줄이 없어 접근성 트리가 통째로 비었다). 패널은 `account/layout.tsx`가 든다.
  { name: "account", Loading: AccountLoading },
  { name: "members", Loading: MembersLoading },
  { name: "settings", Loading: SettingsLoading },
  { name: "sources", Loading: SourcesLoading },
  { name: "translations", Loading: TranslationsLoading },
] as const;

describe.each(SCREENS)("$name 골격", ({ Loading }) => {
  it("패널을 들지 않는다 — `[slug]/layout.tsx`가 이미 든다", async () => {
    const { container } = await render(<Loading />);
    expect(container.querySelector("main")).toBeNull();
  });

  it("낭독 한 줄 + 나머지는 전부 aria-hidden이다", async () => {
    const { container } = await render(<Loading />);
    const status = container.querySelectorAll('[role="status"]');
    expect(status).toHaveLength(1);
    expect(status[0]?.className).toContain("sr-only");
    expect(status[0]?.textContent?.trim()).not.toBe("");
    const visible = [...container.querySelectorAll(":scope > *, :scope > * > *")].filter(
      (el) => el.getAttribute("role") !== "status" && el.closest('[aria-hidden="true"]') === null && el.querySelector('[role="status"]') === null,
    );
    expect(visible).toEqual([]);
  });
});

describe("줄 수 — 실물의 가장 흔한 모양", () => {
  it("Members: 멤버 행 둘(이름·이메일 두 줄) + 대기 초대의 빈 상태", async () => {
    const { container } = await render(<MembersLoading />);
    const rows = container.querySelectorAll("[data-skeleton-member]");
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelectorAll("[data-skeleton-line]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-skeleton-empty]")).toHaveLength(1);
  });

  it("Settings: 카드 넷 — General · Repository · CI · Archive", async () => {
    const { container } = await render(<SettingsLoading />);
    expect(container.querySelectorAll("[data-skeleton-card]")).toHaveLength(4);
  });

  it("Sources: 소스 행 하나(본문·경로 두 줄 — 좁은 그릇에서는 본문이 한 줄 더)", async () => {
    const { container } = await render(<SourcesLoading />);
    const rows = container.querySelectorAll("[data-skeleton-source]");
    expect(rows).toHaveLength(1);
    const lines = [...(rows[0]?.querySelectorAll("[data-skeleton-line]") ?? [])];
    expect(lines.filter(line => line.closest(".hidden") === null)).toHaveLength(2);
    expect(lines).toHaveLength(3);
  });

  /**
   * source-row-locale-meter — 소스 행 셋째 줄 막대 자리(시안 프레임 9). 넓은 그릇은 둘, 좁은 그릇은 하나다(아래 #292 검사).
   * ⚠️ **자리의 두께는 실물과 다르고 합만 같다** — 골격은 라벨 16 + 간격 6 + 바 8, 실물은 배지 20 + 6 + 바 4. jsdom은 높이를 못 재므로
   * 양쪽의 철자를 px로 옮겨 더한다(4px 스케일 · 배지 = `py-0.5` 위아래 + `text-2xs` 줄 높이 16 — `globals.css`의 `calc(1 / 0.75)` × 12).
   */
  it("Sources: 막대 자리 — 묶음은 실물과 같은 철자, 자리 높이 합은 실물 LocaleMeter와 같다", async () => {
    const { container } = await render(<SourcesLoading />);
    const row = container.querySelector("[data-skeleton-source]")!;
    const bundle = row.querySelector("[data-skeleton-meters]")!;
    expect(bundle.className).toBe("mt-2 flex flex-wrap gap-x-3 gap-y-1.5");
    // 이름 칸의 마지막 줄 — 본문·경로 두 줄 아래다.
    expect(bundle.parentElement?.lastElementChild).toBe(bundle);
    expect([...(bundle.parentElement?.children ?? [])].map(child => child.hasAttribute("data-skeleton-name") ? "name" : child.hasAttribute("data-skeleton-line") ? "line" : "meters")).toEqual(["name", "line", "meters"]);
    const slots = [...bundle.querySelectorAll("[data-skeleton-meter]")];
    expect(slots).toHaveLength(2);

    const px = (token: string) => Number(/^(?:h|gap|py)-(\d+(?:\.\d+)?)$/.exec(token)?.[1]) * 4;
    const pick = (element: Element | null | undefined, prefix: string) => [...(element?.classList ?? [])].find(token => new RegExp(`^${prefix}-\\d`).test(token)) ?? "";
    for (const slot of slots) {
      for (const token of ["flex", "w-25", "flex-col", "gap-1.5"]) expect(slot.classList.contains(token)).toBe(true);
      const [label, bar] = [...slot.children];
      expect(label?.classList.contains("rounded-full")).toBe(true);
      expect(bar?.classList.contains("rounded-full")).toBe(true);
      // `/projects` 골격의 실물 치수(`h-5`·`h-1`)가 아니다.
      expect(pick(label, "h")).toBe("h-4");
      expect(pick(bar, "h")).toBe("h-2");
      expect(px(pick(label, "h")) + px(pick(slot, "gap")) + px(pick(bar, "h"))).toBe(30);
    }

    const real = (await render(<LocaleMeter locale={{ code: "fr", total: 10, done: 5, review: 0, percent: 50 }} />)).container.querySelector("[data-locale-meter]")!;
    const [labelRow, track] = [...real.children];
    const badge = labelRow?.firstElementChild;
    expect(badge?.classList.contains("text-2xs")).toBe(true);
    const realHeight = (px(pick(badge, "py")) * 2 + 16) + px(pick(real, "gap")) + px(pick(track, "h"));
    expect(realHeight).toBe(20 + 6 + 4);
    expect(px(pick(slots[0], "gap"))).toBe(px(pick(real, "gap")));
    // 골격 자리는 고정 100, 실물은 최소 100(#293 — 지역 코드만 넓어진다). 2글자 코드의 실물 폭과 같다.
    expect(slots[0]?.classList.contains("w-25") && real.classList.contains("min-w-25")).toBe(true);
  });

  /**
   * #291·#292 — 375의 실제 카드(325, 이름 칸 207)에서 실물 막대는 줄당 하나다. 골격도 좁은 그릇(`@max-form`)에서는 자리 **하나**,
   * 넓은 그릇에서는 둘이다. jsdom은 컨테이너 질의를 계산하지 못하므로 철자를 센다 — 질의는 카드가 이미 선언한 `@container`다.
   */
  /**
   * #295 — 골격 행의 높이 합이 실물 행과 같다. 넓은 그릇(≥ 640)과 좁은 그릇(`@max-form`, 375 → 카드 325 · 이름 칸 207) 둘 다.
   * jsdom은 높이를 못 재므로 골격의 철자를 px로 옮겨 더하고, 실물은 QA 실측(#295)의 분해를 적는다 — 실물 쪽 철자가 바뀌면 이 상수가 거짓이 된다.
   * 실물 넓은 행 109.8 = py-row-y 13×2 + 이름 칸(이름 22.5 + 3 + 경로 17.33 + 3 + mt-2 8 + 막대 30) — 상태 배지 20은 이름 칸 옆이라 더해지지 않는다.
   * 실물 좁은 행 160.3 = 13×2 + 이름 칸(이름 두 줄 45 + 3 + 17.33 + 3 + 8 + 30) + 적층 `gap-y-2` 8 + 상태 배지 20(자기 줄).
   */
  it("Sources: 골격 행 높이 합 = 실물 행(넓은 그릇 109.8 · 좁은 그릇 160.3)", async () => {
    const { container } = await render(<SourcesLoading />);
    const row = container.querySelector("[data-skeleton-source]")!;
    const content = row.firstElementChild!;
    const has = (element: Element, token: string) => element.classList.contains(token);
    const visible = (element: Element, narrow: boolean) => {
      if (narrow && has(element, "@max-form:hidden")) return false;
      if (has(element, "hidden")) return narrow && has(element, "@max-form:block");
      return true;
    };
    const LINE = { "text-base": 22.5, "text-xs": 13 * (4 / 3) } as const;
    const lineHeight = (line: Element) => (Object.entries(LINE).find(([token]) => has(line, token))?.[1] ?? Number.NaN);
    const blockHeight = (element: Element, narrow: boolean): number => {
      if (!visible(element, narrow)) return 0;
      if (element.hasAttribute("data-skeleton-line")) return lineHeight(element);
      if (element.hasAttribute("data-skeleton-meters")) return 8 + 30; // mt-2 + 자리 한 줄(넓은 그릇 둘 · 좁은 그릇 하나 — 위 검사)
      // 줄 래퍼(이름 블록 · 좁은 그릇 둘째 줄) — 간격 없이 쌓인다.
      return [...element.children].reduce((sum, child) => sum + blockHeight(child, narrow), 0);
    };
    const column = content.children[1]!;
    expect(has(column, "gap-copy-gap")).toBe(true);
    const nameColumn = (narrow: boolean) => {
      const parts = [...column.children].map(child => blockHeight(child, narrow)).filter(height => height > 0);
      return parts.reduce((sum, height) => sum + height, 0) + 3 * (parts.length - 1);
    };
    const status = content.children[2]!.firstElementChild!;
    expect(has(content, "py-row-y")).toBe(true);
    expect(SOURCE_CONTENT_STACK).toContain("@max-form:gap-y-2");
    const wide = 13 * 2 + Math.max(28, nameColumn(false), 12);
    const narrow = 13 * 2 + Math.max(28, nameColumn(true)) + 8 + (has(status, "@max-form:h-5") ? 20 : 12);
    expect(has(status, "h-3")).toBe(true);
    expect(wide).toBeCloseTo(13 * 2 + 22.5 + 3 + 13 * (4 / 3) + 3 + 8 + 30, 5);
    expect(wide).toBeCloseTo(109.8, 0);
    expect(narrow).toBeCloseTo(13 * 2 + 45 + 3 + 13 * (4 / 3) + 3 + 8 + 30 + 8 + 20, 5);
    expect(narrow).toBeCloseTo(160.3, 0);
  });

  it("Sources: 막대 자리 — 넓은 그릇 둘, 좁은 그릇(@max-form) 하나", async () => {
    const { container } = await render(<SourcesLoading />);
    const slots = [...container.querySelectorAll("[data-skeleton-meter]")];
    const wide = slots.filter(slot => !slot.classList.contains("hidden"));
    const narrow = slots.filter(slot => !slot.classList.contains("hidden") && !slot.classList.contains("@max-form:hidden"));
    expect(wide).toHaveLength(2);
    expect(narrow).toHaveLength(1);
    expect(narrow[0]).toBe(slots[0]);
    expect(slots[0]?.closest(".\\@container")).not.toBeNull();
    // 새 컨테이너를 선언하지 않는다 — 묶음·자리 어느 쪽도 `@container`가 아니다.
    for (const node of [container.querySelector("[data-skeleton-meters]"), ...slots]) expect(node?.classList.contains("@container")).toBe(false);
  });

  /** 행 끝 chevron 16 칸이 실물에 있다(4-W9) — 없으면 도착 순간 결과 열이 16+12 밀린다. 첫 행은 헤더 급 선이다(4-Y3). */
  it("Logs: 이벤트 행 셋 — 행마다 chevron 칸, 첫 행은 헤더 급 선", async () => {
    const { container } = await render(<LogsLoading />);
    const rows = [...container.querySelectorAll("[data-skeleton-event]")];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.lastElementChild?.className).toContain("size-4");
    expect(rows[0]?.className).toContain("border-foreground/[0.06]");
    expect(rows[1]?.className).toContain("border-border");
  });

  it("Translations: 세 패널 — 트리 · 키 목록 · 상세", async () => {
    const { container } = await render(<TranslationsLoading />);
    expect(container.querySelector("[data-skeleton-tree]")).not.toBeNull();
    expect(container.querySelector("[data-skeleton-keys]")).not.toBeNull();
    expect(container.querySelector("[data-skeleton-detail]")).not.toBeNull();
    for (const row of container.querySelectorAll("[data-skeleton-key]")) {
      expect(row.querySelectorAll("[data-skeleton-line]")).toHaveLength(2);
    }
  });
});

/**
 * **골격과 실물 둘 다 패널 폭 분기가 없고, 좁은 그릇 적층은 같은 상수다** (2026-10-06 사용자 — 옛 판은 malmoi#101로 `@max-[1016px]/panel:*` 변형을 짝지어 셌다.
 * responsive-app이 이 단언을 바꿨다: "질의 0건"이 아니라 "**패널** 질의 0건 + 카드 그릇 640(`@max-form`) 적층이 실물·골격에서 같은 상수").
 * 한쪽에만 분기가 되살아나면 도착 순간 행 높이가 튄다. jsdom은 컨테이너 질의를 계산하지 못하므로 **철자를 센다**.
 */
describe("패널 폭 질의 — 실물과 같은 변형", () => {
  const source = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");
  const panelQueries = (path: string) => source(path).match(/@(?:max|min)-\[[^\]]+\]\/panel|@container\/panel/g) ?? [];

  it("Sources 실물과 골격 어느 쪽도 `/panel` 질의를 들지 않는다", () => {
    expect(panelQueries("components/sources/sources-screen.tsx")).toEqual([]);
    expect(panelQueries("app/(edit)/projects/[slug]/sources/loading.tsx")).toEqual([]);
    expect(panelQueries("components/sources/row-layout.ts")).toEqual([]);
  });

  it("Sources 적층은 실물과 골격이 같은 상수를 들고 카드가 컨테이너를 선언한다", async () => {
    for (const path of ["components/sources/sources-screen.tsx", "app/(edit)/projects/[slug]/sources/loading.tsx"]) {
      expect(source(path)).toContain("SOURCE_CONTENT_STACK");
      expect(source(path)).toContain("SOURCE_STATUS_STACK");
    }
    const { container } = await render(<SourcesLoading />);
    const row = container.querySelector("[data-skeleton-source]")!;
    const content = row.firstElementChild!;
    for (const token of SOURCE_CONTENT_STACK.split(" ")) expect(content.classList.contains(token)).toBe(true);
    const status = container.querySelector("[data-skeleton-status]")!;
    for (const token of SOURCE_STATUS_STACK.split(" ")) expect(status.classList.contains(token)).toBe(true);
    // 상태가 둘째 줄이어도 줄 구조는 DOM 순서 그대로다 — 칩 · 이름 칸 · 상태.
    expect([...content.children]).toHaveLength(3);
    expect(row.parentElement?.classList.contains("@container")).toBe(true);
  });

  it("Logs 적층도 실물과 골격이 같은 상수다", () => {
    for (const path of ["components/logs/event-row.tsx", "app/(edit)/projects/[slug]/logs/loading.tsx"]) {
      for (const name of ["LOG_ROW_STACK", "LOG_ROW_TIME_STACK", "LOG_ROW_RESULT_STACK", "LOG_ROW_CHEVRON_STACK"]) expect(source(path)).toContain(name);
    }
  });

  /*
    ⚠️ **골격 = 실물** (4-Y16 · 4-W13 · 4-Y6) — 실물 머리엔 설명 줄이 없고, 행의 [Open translations]는 2026-09-30에 걷혔고,
    총계 배지는 카드 머리 한 곳이다. 없는 요소를 골격이 그리면 도착 순간 행 폭이 튄다.
  */
  it("실물에 없는 머리 설명·머리 개수·행 버튼을 그리지 않는다", async () => {
    const { container } = await render(<SourcesLoading />);
    expect(container.querySelector("[data-skeleton-description]")).toBeNull();
    const header = container.querySelector("[data-skeleton-header]")!;
    expect(header.querySelectorAll(".rounded-full")).toHaveLength(0);
    const row = container.querySelector("[data-skeleton-source]")!;
    expect(row.querySelector(".h-9")).toBeNull();
  });
});

/**
 * **목록 골격은 `projects/(list)/`에 있다** (audit-ux #21). `projects/`에 바로 두면 그 경계가 `projects`의 자식 키가
 * 바뀔 때(`__PAGE__` → `[slug]`) 다시 서서, 목록 행이나 온보딩 ④에서 프로젝트로 가는 동안 목록 골격이 떴다가
 * 바뀐다 — malmoi#95가 `[slug]/`에서 고친 결함이 한 층 위에 남아 있던 것이다.
 */
describe("목록 경계의 자리", () => {
  it("projects/ 바로 아래에 loading·page가 없고 (list)/에 있다", () => {
    expect(existsSync(join(ROOT, "projects/loading.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "projects/page.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "projects/(list)/loading.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "projects/(list)/page.tsx"))).toBe(true);
  });

  /**
   * **`/projects/new`도 목록 경계 아래다** (audit-ux #21 fix1). GitHub callback이 이 주소로 **전체 로드**로 착지하는데
   * 그 페이지가 목록(`loadProjectList` — 원격 신호 최대 8초)을 기다린다. 경계 밖이면 그동안 빈 화면이다.
   */
  it("/projects/new는 목록 경계 아래다 — (list)/new/", () => {
    expect(existsSync(join(ROOT, "projects/new"))).toBe(false);
    expect(existsSync(join(ROOT, "projects/(list)/new/page.tsx"))).toBe(true);
  });

  it("형제 화면의 경계는 [slug]/에 하나로 두지 않는다 — 각 세그먼트에 있다 (malmoi#95)", () => {
    expect(existsSync(join(ROOT, "projects/[slug]/loading.tsx"))).toBe(false);
    for (const segment of ["members", "settings", "sources", "surfaces/[surfaceSlug]/translations"]) {
      expect(existsSync(join(ROOT, `projects/[slug]/${segment}/loading.tsx`)), segment).toBe(true);
    }
  });
});

/**
 * **글자 줄 자리는 `Skeleton(size)`이다** (ux-drift-unify 4-W8 — `skeleton.tsx`의 규칙). px 높이 블록(`h-4`·`h-5`…)은 `--text-*` 토큰이 바뀔 때
 * 골격만 떠내려간다. 남는 px 블록은 컨트롤 높이(`h-9` — 버튼·필드)와 정사각 글리프(`size-*`)뿐이다.
 */
describe("글자 줄은 Skeleton(size)이다", () => {
  const FILES = [
    "app/(edit)/account/loading.tsx",
    "app/(edit)/projects/(list)/loading.tsx",
    "app/(edit)/projects/[slug]/(home)/loading.tsx",
    "app/(edit)/projects/[slug]/logs/loading.tsx",
    "components/settings/repository-card.tsx",
  ];
  // 알약(`rounded-full` — 배지 자리)은 글자 줄이 아니라 뺀다.
  // `h-[0.8em]`은 글자 크기의 비율이라 줄 상자와 함께 움직인다 — `Skeleton(size)`과 같은 수단이다.
  const PX_LINE = /<Skeleton className="(?![^"]*rounded-full)[^"]*\bh-(?!9\b)(?:[\d.]+\b|\[(?![\d.]+em\]))/g;
  it.each(FILES)("%s에 글자 줄 px 블록이 없다", (path) => {
    const source = readFileSync(join(__dirname, "../../..", path), "utf8");
    expect(source).toMatch(/<Skeleton size="(?:xs|sm|md|lg)"/);
    expect(source.match(PX_LINE) ?? []).toEqual([]);
  });
  it("판정식이 글자 줄 블록을 잡고 컨트롤 높이는 놓아준다 (카나리아)", () => {
    expect('<Skeleton className="h-4 w-12" />'.match(PX_LINE)).toHaveLength(1);
    expect('<Skeleton className="h-3.5 w-[62%] rounded-md" />'.match(PX_LINE)).toHaveLength(1);
    expect('<Skeleton className="h-[21px] w-[72%] rounded-md" />'.match(PX_LINE)).toHaveLength(1);
    expect('<Skeleton className="h-9 w-32 rounded-md" />'.match(PX_LINE)).toBeNull();
    expect('<Skeleton className="size-7 rounded" />'.match(PX_LINE)).toBeNull();
    expect('<Skeleton className="h-[0.8em] w-14 rounded-md" />'.match(PX_LINE)).toBeNull();
    expect('<Skeleton className="ml-auto h-5 w-16 rounded-full" />'.match(PX_LINE)).toBeNull();
  });
});
