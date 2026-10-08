// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

import HomeLoading from "@/app/(edit)/projects/[slug]/(home)/loading";
import InboxLoading from "@/app/(edit)/inbox/loading";
import LogsLoading from "@/app/(edit)/projects/[slug]/logs/loading";
import { EventRow } from "@/components/logs/event-row";
import { LogFilters } from "@/components/logs/log-filters";
import { PanelHeader } from "@/components/shell/content-panel";
import { LocalePanel, LocalePanelSkeleton } from "@/components/translations/workspace/locale-panel";
import type { EventRow as Row } from "@/lib/events/query";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";
import { es } from "@/messages/es";
import { getMessages } from "@/lib/i18n/server";
import { parseLogFilter } from "@/lib/events/filter";

import { find, render } from "./helpers/dom";

vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: vi.fn(async () => (await import("@/messages/en")).en) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
beforeEach(() => { vi.mocked(getMessages).mockResolvedValue(en); });

/**
 * 골격은 실물과 같은 지오메트리를 잡는다(#165) — jsdom은 레이아웃이 없어 px를 못 잰다. 그래서 **실물 소스의 클래스 문자열을
 * 골격이 그대로 쓰는지**를 센다(폭 의존 열 수·행 padding·줄 간격·필터 행). 클래스가 같으면 높이도 같다.
 */
const ROOT = join(import.meta.dirname, "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

it("Home 골격의 숫자 카드 grid는 실물과 같은 컨테이너 쿼리 열이다", async () => {
  const real = source("components/home/count-cards.tsx");
  const grid = real.match(/<ul className="(grid [^"]*)"/)![1]!;
  expect(grid).toContain("@[672px]/cards:grid-cols-4");
  const { container } = await render(HomeLoading());
  const cards = [...container.querySelectorAll<HTMLElement>(".\\@container\\/cards")];
  expect(cards).toHaveLength(1);
  // 선언(컨테이너)과 질문(grid)은 서로 다른 요소다 — 같은 요소면 변형이 어떤 폭에서도 안 걸린다.
  const skeletonGrid = cards[0]!.firstElementChild as HTMLElement;
  expect(skeletonGrid.className).toBe(grid);
  expect(skeletonGrid.children).toHaveLength(4);
});

it("Home 골격의 할 일 행은 실물 행·줄 묶음과 같은 클래스다", async () => {
  const real = source("components/home/attention-card.tsx");
  const row = "flex items-center gap-3 px-4 py-row-y";
  expect(real).toContain("<ListRow");
  expect(source("components/ui/list-row.tsx")).toContain("flex items-center gap-3 px-4 py-row-y");
  // 행 문장 칸 마크업은 T3에서 `attentionRowSlots`를 거쳐 `ListRow`로 옮겨 갔다 — 실물 쪽 기준은 list-row.tsx다.
  expect(source("components/ui/list-row.tsx")).toContain("flex min-w-0 flex-1 flex-col gap-copy-gap");
  const { container } = await render(HomeLoading());
  const li = [...container.querySelectorAll("li")].find((node) => node.className.includes("py-row-y"))!;
  expect(li.className).toContain(row);
  // `justify-center`는 줄 둘이 칸을 채우는 실물에서 효과가 없다 — 간격(gap-copy-gap)과 방향만 같으면 된다.
  expect(li.querySelector(":scope > span")!.className).toMatch(/flex-col.*gap-copy-gap/);
  // 실물은 문장(15) + 표면·로케일(13) 두 줄이다.
  expect(li.querySelectorAll("[data-skeleton-line]")).toHaveLength(3);
  // 보조줄 행간은 실물(ListRow 문장 칸의 description)과 같다 — 실물이 `leading-normal`(19.5)인데 골격이 기본 행간(17.33)이면 행마다 ≈2px 밀린다.
  const copy = source("components/ui/list-row.tsx").match(/text-muted-foreground text-xs (leading-normal)/)?.[1];
  expect(copy).toBe("leading-normal");
  expect(li.querySelectorAll("[data-skeleton-line]")[1]!.className).toContain(copy);
});

it("Logs 골격 머리는 필터 행을 든다 — 실물과 같은 행 클래스와 높이 36 컨트롤", async () => {
  const real = source("components/logs/log-filters.tsx");
  const filterRow = real.match(/data-log-filter-row className="([^"]*)"/)![1]!;
  const { container } = await render(LogsLoading());
  const row = container.querySelector<HTMLElement>("[data-skeleton-filter-row]")!;
  expect(row.className).toBe(filterRow);
  expect(row.querySelectorAll(".h-9").length).toBeGreaterThan(0);
});

it.each([["en", en], ["ko", ko], ["es", es]] as const)("Logs %s 기본 골격은 다섯 필터의 실제 라벨·프리미티브와 검색320으로 같은 줄바꿈 입력을 든다", async (uiLocale, m) => {
  vi.mocked(getMessages).mockResolvedValue(m);
  const { container: real } = await render(<PanelHeader><LogFilters
    slug="alpha" filter={parseLogFilter({})} sources={[]} actors={[]} refreshable
    now="2026-10-08T00:00:00Z"
  /></PanelHeader>, { uiLocale });
  const { container: skeleton } = await render(LogsLoading());
  const realRow = find(real, "[data-log-filter-row]");
  const loadingRow = find(skeleton, "[data-skeleton-filter-row]");
  const filters = [...realRow.querySelectorAll<HTMLButtonElement>(":scope > button")];
  expect(filters).toHaveLength(5);
  expect(filters.map(node => node.textContent)).toEqual([
    m.logs.kinds.all, m.logs.filters.anyDate, m.logs.filters.anyone,
    m.logs.filters.anySource, m.logs.filters.anyResult,
  ]);
  expect(loadingRow.className).toBe(realRow.className);
  const slots = [...loadingRow.children];
  expect(slots).toHaveLength(6);
  filters.forEach((control, index) => {
    const slot = slots[index]!;
    const sizingControl = find<HTMLButtonElement>(slot, "button");
    expect(sizingControl.textContent).toBe(control.textContent);
    expect(sizingControl.className.replace(" invisible", "")).toBe(control.className);
    expect(sizingControl.classList.contains("h-9")).toBe(true);
    expect(slot.classList.contains("shrink-0")).toBe(true);
    expect(slot.classList.contains("flex")).toBe(true);
    expect(slot.className).not.toMatch(/\bw-\S+/);
    expect(sizingControl.disabled).toBe(true);
    expect(sizingControl.tabIndex).toBe(-1);
    expect(slot.querySelector(".absolute.inset-0")).not.toBeNull();
  });
  const search = find<HTMLInputElement>(realRow, 'input[type="search"]');
  const loadingSearch = find<HTMLInputElement>(slots[5]!, 'input[type="search"]');
  expect(search.classList.contains("w-80")).toBe(true);
  expect(loadingSearch.className.replace(" invisible", "")).toBe(search.className);
  expect(slots[5]!.className).toBe(search.parentElement!.parentElement!.className);
  expect(loadingSearch.disabled).toBe(true);
  expect(loadingSearch.tabIndex).toBe(-1);
  expect(loadingSearch.parentElement!.querySelector("svg")!.classList.contains("invisible")).toBe(true);

  const titleRow = realRow.previousElementSibling!;
  const loadingTitle = loadingRow.previousElementSibling!;
  expect(loadingTitle.className).toBe(titleRow.className);
  const title = find(real, "h1");
  const titleSizer = find(loadingTitle, "h1");
  expect(titleSizer.textContent).toBe(title.textContent);
  expect(titleSizer.className.replace(" invisible", "")).toBe(title.className.replace(" min-h-9", ""));
  // 최소 높이는 PanelHeader가 소유한다 — 골격 제목이 중복 선언하지 않는다.
  expect(loadingTitle.parentElement!.classList.contains("[&>:first-child]:min-h-9")).toBe(true);
  const refresh = find(titleRow, "button");
  const refreshSizer = find(loadingTitle, "button");
  expect(refreshSizer.className.replace(" invisible", "")).toBe(refresh.className);
  expect(refreshSizer.classList.contains("h-9")).toBe(true);
  expect(refreshSizer.textContent).toBe(refresh.textContent);
  expect(skeleton.querySelector('[role="status"]')?.textContent).toBe(m.logs.loading.list);
  expect(loadingRow.closest('[aria-hidden="true"]')).not.toBeNull();
});

it("Logs 골격 행은 실물 EventRow와 같은 padding·줄 묶음이고 보조 줄이 있다", async () => {
  const real = source("components/logs/event-row.tsx");
  expect(real).toContain("<ListRow");
  expect(source("components/ui/list-row.tsx")).toContain("flex items-center gap-3 px-4 py-row-y");
  expect(real).toContain("flex min-w-0 flex-1 flex-col gap-copy-gap");
  const { container } = await render(LogsLoading());
  const row = container.querySelector<HTMLElement>("[data-skeleton-event]")!;
  expect(row.className).toContain("gap-3 border-t px-4 py-row-y");
  const stack = row.querySelector<HTMLElement>("[data-skeleton-stack]")!;
  expect(stack.className).toContain("flex min-w-0 flex-1 flex-col gap-copy-gap");
  expect(stack.children).toHaveLength(2);
});

const eventTime = new Date("2026-10-08T12:00:00Z");
const geometryEvent: Row = {
  id: "e1", ref: "evt_geometry", kind: "IMPORT", subtype: "import.run",
  occurredAt: eventTime, finishedAt: eventTime, result: "imported",
  actor: { kind: "USER", removed: false, name: "Kim", emailLabel: null },
  surfaceIds: ["s1"], surfaceScope: "sources", run: null, payload: null,
};

it("Logs 골격의 시각 슬롯은 실물과 같은 112px 고정 폭이다", async () => {
  const { container: real } = await render(<EventRow row={geometryEvent} href="/logs" now={eventTime} archived={false} style={{ uiLocale: "en", timeZone: "UTC" }} m={en} />);
  const { container: skeleton } = await render(LogsLoading());
  const time = find(real, "a > time");
  expect(time.classList.contains("w-28")).toBe(true);
  expect(time.classList.contains("shrink-0")).toBe(true);
  const rows = skeleton.querySelectorAll("[data-skeleton-event]");
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    const slot = find(row, ":scope > div:first-child");
    expect(slot.classList.contains("w-28")).toBe(time.classList.contains("w-28"));
    expect(slot.classList.contains("shrink-0")).toBe(true);
  }
});

it.each(["imported", null] as const)("Logs 골격의 결과 슬롯은 결과(%s) 유무와 무관하게 실물과 같은 172px 고정 폭이다", async result => {
  const { container: real } = await render(<EventRow row={{ ...geometryEvent, result }} href="/logs" now={eventTime} archived={false} style={{ uiLocale: "en", timeZone: "UTC" }} m={en} />);
  const { container: skeleton } = await render(LogsLoading());
  const realSlot = find(real, "a > :nth-last-child(2)");
  expect(realSlot.classList.contains("w-[172px]")).toBe(true);
  expect(realSlot.classList.contains("shrink-0")).toBe(true);
  for (const row of skeleton.querySelectorAll("[data-skeleton-event]")) {
    const slot = find(row, ":scope > :nth-last-child(2)");
    expect(slot.classList.contains("w-[172px]")).toBe(realSlot.classList.contains("w-[172px]"));
    expect(slot.classList.contains("shrink-0")).toBe(true);
    expect(slot.classList.contains("justify-end")).toBe(realSlot.classList.contains("justify-end"));
    // 짧은 막대가 고정 슬롯의 폭을 대신하지 않아야 한다.
    expect(slot.querySelector("[data-skeleton-line]")).not.toBeNull();
  }
});

it("번역 상세 복사 링크 골격은 실물 sm 버튼과 같은 28px 크기·radius8이다", async () => {
  const { container: real } = await render(<LocalePanel
    detail={{ key: { id: "k1", key: "title", namespace: "common", sourceText: "Title", description: null, surfaceSlug: "web" }, refs: [], locales: [] }}
    draft={{ keyId: "k1", order: [], saved: {}, draft: {} }}
    language={undefined} onLanguage={() => {}} onEdit={() => {}} onReset={() => {}} onSave={() => {}}
    copyHref="/translations?key=k1" readOnly={false} footer={null}
  />);
  const { container: skeleton } = await render(<LocalePanelSkeleton />);
  const button = find(real, `button[aria-label="${en.translations.workspace.detail.copyLink}"]`);
  expect(button.classList.contains("h-7")).toBe(true);
  expect(button.classList.contains("min-w-7")).toBe(true);
  expect(button.classList.contains("rounded-sm")).toBe(true);
  const slot = find(skeleton, "[data-skeleton-detail] > :nth-child(2) > :first-child > :first-child > :last-child");
  expect(slot.classList.contains("size-7")).toBe(true);
  expect(slot.classList.contains("shrink-0")).toBe(true);
  expect(slot.classList.contains("rounded-sm")).toBe(button.classList.contains("rounded-sm"));
  expect(slot.classList.contains("rounded-md")).toBe(false);
});

/**
 * Home 메타 열 골격 (project-card-tabs T9) — **탭 머리는 실물**(같은 머리 클래스 · 같은 세그먼트 상수 · 같은 라벨)이고 본문은 Project 탭 8행
 * (묶음 4·3·1)이다. ⚠️ **바닥 `Settings ›` 자리는 역할과 무관하게 늘 그린다** — 라우트 골격은 params·세션을 못 받아 역할을 모른다
 * (2026-10-04 지휘자 판정 — 주 독자 OWNER 기준, EDITOR는 도착 때 45px 줄어든다. DESIGN §6.64 이탈 표).
 */
it("Home 골격의 메타 열은 실물 탭 머리 + Project 탭 8행(4·3·1) + 바닥이다", async () => {
  const real = source("components/home/meta-tabs.tsx");
  const head = real.match(/data-meta-head className="([^"]*)"/)![1]!;
  const { container } = await render(HomeLoading());
  const aside = container.querySelector<HTMLElement>("aside")!;
  const skeletonHead = aside.querySelector<HTMLElement>("[data-skeleton-meta-head]")!;
  expect(skeletonHead.className).toBe(head);
  expect([...skeletonHead.querySelectorAll("span.truncate")].map((node) => node.textContent)).toEqual(["Project", "Sync", "Publish"]);
  const groups = [...aside.querySelectorAll<HTMLElement>("[data-skeleton-meta-group]")];
  expect(groups.map((group) => group.children.length)).toEqual([4, 3, 1]);
  // 첫 묶음은 머리 선을 쓴다 — 실물 묶음과 같은 규칙이다.
  expect(groups.map((group) => group.className.includes("border-t"))).toEqual([false, true, true]);
  expect(aside.lastElementChild?.className).toContain("h-[45px]");
});

/**
 * malmoi#181 — 골격 막대 폭이 **행마다 다르다**(시안 v3 `2e`) — 여덟 줄이 같은 폭이면 실물 행의 모양을 미리 보이지 못한다.
 * 라벨 막대는 실제 라벨 길이(Repository · Connection · Branch · CI / Sources · Keys · Members / Created), 값 막대는 그 행 값의 흔한 길이다.
 */
it("Home 골격의 메타 열 막대 폭이 시안의 행별 폭이다", async () => {
  const { container } = await render(HomeLoading());
  const rows = [...container.querySelectorAll<HTMLElement>("aside [data-skeleton-meta-group] > div")];
  const width = (node: Element | null | undefined) => node?.className.match(/\bw-(\d+)\b/)?.[1];
  const bar = (row: HTMLElement, i: 0 | 1) => row.children[i]?.querySelector("[data-skeleton-line] > div");
  expect(rows.map((row) => Number(width(bar(row, 0))) * 4)).toEqual([64, 72, 48, 24, 52, 36, 56, 52]);
  expect(rows.map((row) => Number(width(bar(row, 1))) * 4)).toEqual([120, 84, 40, 76, 20, 36, 20, 80]);
});

/**
 * #204 — **머리 아래 선은 머리가 든다**(`Card`의 `border-divider border-b`). 실물은 그 1px을 `min-h-12` 안에 흡수하고(47.5 < 48) 첫 행은
 * 자기 선을 내려놓아 71이다. 골격이 선을 첫 행 위(`border-t`)에 그으면 첫 행이 72라 도착하는 순간 아래가 전부 1px 올라간다.
 */
it.each([
  ["Inbox", () => InboxLoading(), 2],
  ["Home", () => HomeLoading(), 2],
] as const)("%s 골격 카드는 머리에 선을 긋고 첫 행·첫 목록에는 위 선이 없다", async (_label, loading, cards) => {
  const card = source("components/ui/card.tsx");
  expect(card).toContain('notice === undefined && "border-divider border-b"');
  const { container } = await render(loading());
  const sections = [...container.querySelectorAll<HTMLElement>("section")];
  expect(sections).toHaveLength(cards);
  for (const section of sections) {
    const head = section.firstElementChild as HTMLElement;
    for (const token of ["min-h-12", "border-divider", "border-b"]) expect(head.classList, token).toContain(token);
    const list = section.querySelector<HTMLElement>(":scope > ul")!;
    expect(list.classList.contains("border-t"), list.className).toBe(false);
    const rows = [...list.querySelectorAll<HTMLElement>(":scope > li")];
    expect(rows[0]!.classList.contains("border-t"), rows[0]!.className).toBe(false);
    // 행↔행은 `--border`다 — 실물 `Card` 규칙(4-Y4).
    for (const row of rows.slice(1).filter(row => row.classList.contains("border-t"))) expect(row.classList).toContain("border-border");
  }
});
