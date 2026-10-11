// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { Dialog } from "radix-ui";

import { EventDetail } from "@/components/logs/event-detail";
import { EventRow } from "@/components/logs/event-row";
import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { PANEL_HEAD_ROW } from "@/components/shell/content-panel";
import SourcesLoading from "../../app/(edit)/projects/[slug]/sources/loading";
import { SOURCE_STATUS_STACK } from "@/components/sources/row-layout";
import { HOME_LOG_CHEVRON_STACK, HOME_LOG_RESULT_STACK, HOME_LOG_ROW_STACK, LOG_ROW_CHEVRON_STACK, LOG_ROW_RESULT_STACK, LOG_ROW_STACK, LOG_ROW_TIME_STACK } from "@/components/logs/row-layout";
import type { EventRow as Row } from "@/lib/events/query";
import { en } from "@/messages/en";
import LogsLoading from "../../app/(edit)/projects/[slug]/logs/loading";
import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

/**
 * **responsive-app B3 — Logs 행·이력 상세 시트 머리.** jsdom은 컨테이너 질의를 못 재므로 클래스 계약을 센다.
 * 적층 기준은 뷰포트(`max-lg:`)가 아니라 **조상 컨테이너**(`@max-form`)이고, 시트 머리 형(`max-lg:`)만 예외다(DESIGN §6.4 전체 화면 시트).
 */
const ROOT = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const tokens = (element: Element | null | undefined) => [...(element?.classList ?? [])];
const split = (classes: string) => classes.split(/\s+/).filter(Boolean);
const has = (element: Element | null | undefined, classes: string) => expect(tokens(element)).toEqual(expect.arrayContaining(split(classes)));

const now = new Date("2026-09-20T12:00:00Z");
const style = { uiLocale: "en", timeZone: "UTC" } as const;
const row = (over: Partial<Row> = {}): Row => ({
  id: "e1", ref: "evt_test", kind: "IMPORT", subtype: "import.run", occurredAt: now, finishedAt: now,
  result: "imported", actor: { kind: "USER", removed: false, name: "Kim", emailLabel: null },
  surfaceIds: ["s1"], surfaceScope: "sources", run: null,
  payload: { kind: "IMPORT", source: "manual", surfaceSlugs: ["web"], keys: 4, pendingEdits: 0,
    surfaces: [{ surfaceSlug: "web", status: "imported", count: 4, reason: null }], errorCode: null, refusal: null, deferReason: null, changedValues: null },
  ...over,
});

it("행 적층 상수는 전부 컨테이너 기준이다 — 뷰포트 분기·CSS order가 없다", () => {
  for (const constant of [LOG_ROW_STACK, LOG_ROW_TIME_STACK, LOG_ROW_RESULT_STACK, LOG_ROW_CHEVRON_STACK]) {
    for (const token of split(constant)) {
      expect(token.startsWith("@max-form:")).toBe(true);
      expect(token).not.toMatch(/(^|:)order-/);
    }
  }
});

it("Logs 행: DOM 순서는 그대로(시각 → 글리프 → 문장 → 결과 → chevron)이고 좁은 그릇 적층 클래스가 붙는다", async () => {
  const { container } = await render(<EventRow row={row()} href="/logs?event=evt_test" now={now} archived={false} style={style} m={en} />);
  const link = container.querySelector("a")!;
  has(link, LOG_ROW_STACK);
  // 컨테이너 선언은 날짜 카드가 한다 — 질의하는 행 자신이 선언하면 질의가 영영 참이 되지 않는다(POSTMORTEM 2026-09-15).
  expect(tokens(link)).not.toContain("@container");
  const kids = [...link.children];
  expect(kids.map(kid => kid.tagName.toLowerCase())).toEqual(["time", "span", "span", "span", "span"]);
  const [time, glyph, copy, result, chevron] = kids;
  has(time, LOG_ROW_TIME_STACK);
  expect(glyph?.hasAttribute("aria-hidden")).toBe(true);
  expect(copy?.querySelector("[data-event-meta]")).not.toBeNull();
  has(result, LOG_ROW_RESULT_STACK);
  has(chevron, LOG_ROW_CHEVRON_STACK);
  // 넓은 폭 클래스는 바이트 그대로다 — 시각 열 112 · 결과 열 172.
  has(time, "w-28 shrink-0 text-sm whitespace-nowrap tabular-nums");
  has(result, "flex w-[172px] shrink-0 flex-wrap items-center justify-end gap-1.5");
  for (const kid of [link, ...kids]) expect(tokens(kid).some(token => /(^|:)order-/.test(token))).toBe(false);
});

it("결과 배지가 없는 행(번역 편집)은 결과 칸이 비어 `empty:hidden`이 셋째 줄을 세우지 않는다", async () => {
  const edit = row({ kind: "TRANSLATION", subtype: "translation.edit", result: null, finishedAt: null,
    payload: { kind: "TRANSLATION", surfaceSlug: "web", key: "a.b", locale: "ko", before: "x", after: "y" } as Row["payload"] });
  const { container } = await render(<EventRow row={edit} href="/logs?event=evt_test" now={now} archived={false} style={style} m={en} />);
  const result = container.querySelector("a")!.children[3]!;
  expect(result.childNodes.length).toBe(0);
  has(result, "@max-form:empty:hidden");
});

// 옛 B3 범위 가드는 Home을 제외했다 — responsive-132 #2가 그 제외를 끝낸다.
it("Home 최근 로그는 시각 없는 첫 줄과 결과 아래 줄을 가진다", async () => {
  const { container } = await render(<EventRow row={row()} href="/logs?event=evt_test" now={now} archived={false} showTime={false} style={style} m={en} />);
  const link = container.querySelector("a")!;
  has(link, HOME_LOG_ROW_STACK);
  has(link.children[2], HOME_LOG_RESULT_STACK);
  has(link.lastElementChild, HOME_LOG_CHEVRON_STACK);
  expect(link.querySelector("time")).toBeNull();
});

it("Logs 골격 행은 실물과 같은 적층 상수를 쓴다 — 적층 조건이 같다", async () => {
  const { container } = await render(<LogsLoading />);
  const rows = [...container.querySelectorAll("[data-skeleton-event]")];
  expect(rows).toHaveLength(3);
  for (const skeletonRow of rows) {
    has(skeletonRow, LOG_ROW_STACK);
    const [time, , , result, chevron] = [...skeletonRow.children];
    has(time, LOG_ROW_TIME_STACK);
    has(result, LOG_ROW_RESULT_STACK);
    has(chevron, LOG_ROW_CHEVRON_STACK);
  }
  // 컨테이너 선언은 카드가 든다 — 행(질의)과 다른 요소다(POSTMORTEM 2026-09-15).
  has(rows[0]?.parentElement, "@container");
  expect(tokens(rows[0]).includes("@container")).toBe(false);
});

it("Logs 실물 날짜 카드도 컨테이너를 선언한다 — 행과 다른 요소", () => {
  const page = read("app/(edit)/projects/[slug]/logs/page.tsx");
  expect(page).toMatch(/className="@container border-border overflow-hidden rounded-lg border bg-background"/);
});

/**
 * 이력 상세 시트 머리 (design §2 — 공개 R6 넘김). `lg` 미만은 LargeModal 시트 머리 56 형: 좌 16 · 우 12 · 제목 18/500 · 닫기 32 · divider.
 * `lg` 이상 클래스는 바이트 그대로다(`logs-events.test.tsx`의 `px-6`·`pl-[76px]` 계약이 같이 선다).
 */
const detail = (value: Row) => render(
  <Dialog.Root open><Dialog.Content aria-describedby={undefined}>
    <EventDetail row={value} slug="alpha" now={now} archived={false} canOpenSettings={false} repoUrl={null} style={style} m={en} />
  </Dialog.Content></Dialog.Root>,
);

it("이력 상세 머리: 시트(`max-lg:`)에서 좌 16 · 우 12 · 위 12 · 아래 divider · 최소 56이고 lg 이상은 그대로다", async () => {
  const { container } = await detail(row());
  const header = container.querySelector("[data-event-detail-header]");
  has(header, "px-6 pt-6 pb-4 gap-3");
  has(header, "max-lg:min-h-14 max-lg:border-b max-lg:border-divider max-lg:pt-3 max-lg:pr-3 max-lg:pb-3 max-lg:pl-4");
  // 제목 열은 닫기 32(우 12) 자리를 비운다 — 넓은 폭의 36(`pr-9`)은 그대로.
  const titleColumn = header?.lastElementChild;
  has(titleColumn, "pr-9 max-lg:pr-11");
});

it("이력 상세 본문·바닥: 시트에서 안쪽 16이고 바닥은 감긴다 — 본문은 칩 열 76 들여쓰기를 시트에서 푼다", async () => {
  const { container } = await detail(row());
  has(container.querySelector("[data-event-detail-body]"), "pr-6 pl-[76px] max-lg:px-4 max-lg:pt-4");
  has(container.querySelector("[data-event-detail-footer]"), "px-6 py-4 max-lg:px-4 max-lg:flex-wrap");
});

it("사용자 지정 기간 칸: Dialog 본문이 320 미만이면 한 열이다 — 선언(바깥 래퍼)과 질의(격자)가 다른 요소다", () => {
  const filters = read("components/logs/log-filters.tsx");
  expect(filters).toMatch(/<div className="@container">\s*<div className="grid grid-cols-2 gap-3 @max-\[20rem\]:grid-cols-1">/);
});

/**
 * **머리 두 줄 (B1a · orch O4)** — 손으로 든 머리 둘(Logs `LogFilters`의 제목 행 · Sources 머리)이 `PANEL_HEAD_ROW`를 쓰고 골격도 같은 조각이다.
 * 640 미만(머리 컨테이너 `@container/panel-head` — `PanelHeader`가 선언)이면 제목 첫 줄 · 버튼 묶음 둘째 줄 오른쪽이다. 선언은 `PanelHeader`가 하므로 여기서 다시 적지 않는다.
 */
const ROW = split(PANEL_HEAD_ROW);

it("Logs 머리: 제목 행이 PANEL_HEAD_ROW이고 첫 자식이 제목(+보관 배지), 뒤 형제가 Refresh 묶음이다", async () => {
  const props = { slug: "alpha", sources: [], actors: [], now: "2026-10-04T23:10:00.000Z" };
  const live = (await render(<LogFilters {...props} refreshable filter={parseLogFilter({})} />)).container;
  const row = live.querySelector("h1")!.closest(`.${"flex-col"}`)!;
  expect(ROW.every(token => tokens(row).includes(token))).toBe(true);
  const [title, actions] = [...row.children];
  expect(title?.querySelector("h1")).not.toBeNull();
  expect(actions?.querySelector("button")?.textContent).toBe(en.logs.refresh);
  expect(tokens(actions)).not.toContain("ml-auto");
  expect(row.children).toHaveLength(2);
  // 보관 프로젝트는 Refresh가 없다 — 제목(+배지)만 남고 버튼 묶음 자리가 비어 제목이 오른쪽으로 밀리지 않는다.
  const archived = (await render(<LogFilters {...props} refreshable={false} filter={parseLogFilter({})} />)).container;
  const archivedRow = archived.querySelector("h1")!.closest(`.${"flex-col"}`)!;
  expect(archivedRow.children).toHaveLength(1);
  expect(archivedRow.firstElementChild?.textContent).toContain(en.common.nav.logs);
});

it("Logs 골격 머리도 같은 조각이다 — 줄 수가 실물과 같다", async () => {
  const { container } = await render(<LogsLoading />);
  const row = container.querySelector("[data-skeleton-header]")!;
  expect(ROW.every(token => tokens(row).includes(token))).toBe(true);
  expect(row.children).toHaveLength(2);
  expect(tokens(row.lastElementChild)).not.toContain("ml-auto");
});

it("Sources 머리와 골격은 PANEL_HEAD_ROW다 — 제목이 먼저, Add sources가 뒤 형제이고 ml-auto가 없다", async () => {
  for (const path of ["components/sources/sources-screen.tsx", "app/(edit)/projects/[slug]/sources/loading.tsx"]) {
    const source = read(path);
    const head = /<PanelHeader\b[^>]*>([\s\S]*?)<\/PanelHeader>/.exec(source)?.[1] ?? "";
    expect(head, path).toMatch(/^\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*<div[^>]*className=\{PANEL_HEAD_ROW\}>/);
    expect(head, path).not.toMatch(/flex-wrap|ml-auto/);
  }
  const { container } = await render(<SourcesLoading />);
  const row = container.querySelector("[data-skeleton-header]")!;
  expect(ROW.every(token => tokens(row).includes(token))).toBe(true);
  expect(row.children).toHaveLength(2);
});

/**
 * fix1 Y4 — 이력 상세 missing 상태도 시트 머리 정렬이다: 좌 16(`max-lg:pl-4`) · 닫기(위 12 · 32 → 가운데 28)와 제목 줄(18/28) 가운데를 맞추는 위 14(`max-lg:pt-3.5`) ·
 * 닫기 자리(우 12 + 32 + 간격)를 비우는 `max-lg:pr-14`. `lg` 이상 `p-6`은 그대로다.
 */
it("이력 상세 missing 상태: 시트 머리 정렬 클래스를 든다 — lg 이상 p-6 불변", () => {
  const page = read("app/(edit)/projects/[slug]/logs/page.tsx");
  const missing = /<div className="(flex flex-col gap-1 p-6[^"]*)">\s*<h2 className="text-lg font-medium">\{m\.logs\.detail\.missing\.title\}/.exec(page)?.[1];
  expect(missing).toBeDefined();
  expect(split(missing!)).toEqual(expect.arrayContaining(["p-6", "max-lg:pl-4", "max-lg:pt-3.5", "max-lg:pr-14"]));
});

/** fix1 Y6 — Sources 행 상태 줄의 `pl-10`은 칩 28 + 간격 12(`gap-3`)다 — 셋이 한 곳에서 움직이도록 묶는다. */
it("Sources 상태 줄 들여쓰기 pl-10 = 칩 28 + 간격 12 — 칩·간격 값이 바뀌면 같이 움직인다", () => {
  expect(SOURCE_STATUS_STACK).toContain("@max-form:pl-10");
  const screen = read("components/sources/sources-screen.tsx");
  expect(screen).toMatch(/<span data-source-content className=\{cn\("flex min-w-0 flex-1 items-center gap-3 px-4 py-row-y"/);
  expect(read("components/ui/icon-tile.tsx")).toMatch(/sm:\s*"[^"]*\bsize-7\b/);
});
