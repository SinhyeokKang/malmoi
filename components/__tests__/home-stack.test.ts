import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HOME_GRID } from "@/components/home/grid";

/**
 * **Home 본문 적층** (responsive-app A2 · 시안 AT3) — Home 콘텐츠 그릇(`PanelBody` content box)이 960 미만이면 `minmax(0,1fr) | 320` 두 열이 한 열이
 * 되고, 메타가 맨 아래로 간다. 순서는 DOM 그대로다(카운트 → Needs your attention → Recent logs → 메타) — CSS `order`·두 벌 렌더가 없다.
 *
 * ⚠️ **선언과 질의는 다른 요소다**(POSTMORTEM 2026-09-15) — `PanelBody`의 안쪽 래퍼가 `@container/home`을 선언하고, 그 자식 격자가 묻는다.
 * jsdom은 컨테이너 쿼리를 못 잰다 — 여기는 클래스 계약이고 959/960/961 computed는 실측이 잰다.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const PAGE = read("app/(edit)/projects/[slug]/(home)/page.tsx");
const LOADING = read("app/(edit)/projects/[slug]/(home)/loading.tsx");

describe("Home — 960 미만 한 열", () => {
  it("격자는 한 열에서 시작하고 그릇 960부터 두 열이다", () => {
    const classes = HOME_GRID.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "@[960px]/home:grid-cols-[minmax(0,1fr)_320px]", "items-start", "gap-5"]));
    expect(HOME_GRID).not.toMatch(/@container|\border-/);
  });

  it.each([["page", PAGE], ["loading", LOADING]])("%s — 본문이 그릇을 선언하고 바로 안의 격자가 HOME_GRID다", (_name, source) => {
    expect(source).toMatch(/<PanelBody className="@container\/home"(?: aria-hidden)?>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*<div className=\{HOME_GRID\}>/);
    // 옛 두 열 고정이 본문에 남지 않는다.
    expect(source).not.toMatch(/<PanelBody className="grid /);
  });

  it("DOM 순서 — 배너 · 카운트 · 할 일 · 로그 · 메타", () => {
    const order = ["<HomeNotices", "<CountCards", "<AttentionCard", "<LogsCard", "<MetaColumn"].map((tag) => PAGE.indexOf(tag));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(PAGE).not.toMatch(/\border-(?:first|last|\d)/);
  });

  it("카운트 카드의 672 질의는 그대로다", () => {
    expect(read("components/home/count-cards.tsx")).toMatch(/className="@container\/cards"/);
    expect(LOADING).toMatch(/@\[672px\]\/cards:grid-cols-4/);
  });

  it("메타 열 리포 이름이 아무 데서나 감긴다 — 전폭에서 긴 owner/name이 넘치지 않는다", () => {
    const meta = read("components/home/meta-column.tsx");
    const repo = /case "repository":[\s\S]*?return \(([\s\S]*?)\);/.exec(meta)?.[1] ?? "";
    expect(repo).toMatch(/wrap-anywhere/);
  });
});
