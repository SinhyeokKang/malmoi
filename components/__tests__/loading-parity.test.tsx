// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

import HomeLoading from "@/app/(edit)/projects/[slug]/(home)/loading";
import LogsLoading from "@/app/(edit)/projects/[slug]/logs/loading";

import { render } from "./helpers/dom";

vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

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
  const row = "flex items-center gap-3 border-t px-4 py-row-y";
  expect(real).toContain("<ListRow");
  expect(source("components/ui/list-row.tsx")).toContain("flex items-center gap-3 px-4 py-row-y");
  expect(real).toContain("flex min-w-0 flex-1 flex-col gap-copy-gap");
  const { container } = await render(HomeLoading());
  const li = [...container.querySelectorAll("li")].find((node) => node.className.includes("py-row-y"))!;
  expect(li.className).toContain(row);
  // `justify-center`는 줄 둘이 칸을 채우는 실물에서 효과가 없다 — 간격(gap-copy-gap)과 방향만 같으면 된다.
  expect(li.querySelector(":scope > span")!.className).toMatch(/flex-col.*gap-copy-gap/);
  // 실물은 문장(15) + 표면·로케일(13) 두 줄이다.
  expect(li.querySelectorAll("[data-skeleton-line]")).toHaveLength(3);
});

it("Logs 골격 머리는 필터 행을 든다 — 실물과 같은 행 클래스와 높이 36 컨트롤", async () => {
  const real = source("components/logs/log-filters.tsx");
  const filterRow = real.match(/data-log-filter-row className="([^"]*)"/)![1]!;
  const { container } = await render(LogsLoading());
  const row = container.querySelector<HTMLElement>("[data-skeleton-filter-row]")!;
  expect(row.className).toBe(filterRow);
  expect(row.querySelectorAll(".h-9").length).toBeGreaterThan(0);
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
