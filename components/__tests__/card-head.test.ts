import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **카드 머리는 상하 12 · 좌우 16 · 최소 높이 48이다** (2026-09-28 사용자 — 전 영역 공통, 옛 전방향 16 `p-4`). 패널 머리(`PanelHeader`)와
 * 같은 날 같은 값으로 옮겼다 — `panel-header.test.tsx`. **최소 48(`min-h-12`)** 은 같은 날 더했다 — 설명 문구를 걷어 낸 카드와 든
 * 카드의 머리 높이가 갈리지 않게 한다.
 *
 * ⚠️ **카드 머리는 한 프리미티브가 들지 않는다.** `PanelCard`·`RowCard` 둘이 대부분을 들고, Home·Logs의 카드 넷이 같은 값을 손으로
 * 적고, 로딩 골격 여덟이 그 모양을 흉내 낸다(골격이 실물과 다르면 도착하는 순간 첫 행이 튄다). 규격이 바뀌면 손으로 적은 쪽이 옛
 * 값에 남으므로 **소스에서 센다** — 자리마다 옛 문자열은 0, 새 문자열은 정해진 수다.
 */
const ROOT = process.cwd();

const SITES: { path: string; head: string; count: number }[] = [
  // 프리미티브
  { path: "components/ui/panel-card.tsx", head: "border-divider flex min-h-12 flex-wrap items-center gap-2 {pad} ", count: 1 },
  { path: "components/ui/row-card.tsx", head: '"flex min-h-12 items-center gap-2 {pad}"', count: 1 },
  // 손으로 적은 실물 — Home 카드 셋과 Logs 날짜 카드
  { path: "components/home/attention-card.tsx", head: '"flex min-h-12 items-center gap-2 {pad} text-base font-medium"', count: 1 },
  { path: "components/home/logs-card.tsx", head: '"flex min-h-12 shrink-0 items-center {pad} text-base font-medium"', count: 1 },
  { path: "components/home/meta-column.tsx", head: '"flex min-h-12 items-center {pad} text-base font-medium"', count: 1 },
  { path: "app/(edit)/projects/[slug]/logs/page.tsx", head: '"flex min-h-12 items-center gap-2 {pad}"', count: 1 },
  // 로딩 골격 — PanelCard형 셋 · RowCard형 둘 · Home · Logs
  { path: "app/(edit)/projects/[slug]/settings/loading.tsx", head: '"border-divider flex min-h-12 items-center gap-2 border-b {pad}"', count: 1 },
  { path: "app/(edit)/projects/[slug]/sources/loading.tsx", head: '"border-divider flex min-h-12 items-center gap-2 border-b {pad}"', count: 1 },
  { path: "app/(edit)/account/loading.tsx", head: '"border-divider flex min-h-12 items-center gap-2 border-b {pad}"', count: 1 },
  { path: "app/(edit)/projects/(list)/loading.tsx", head: '"flex min-h-12 items-center gap-2 {pad}"', count: 1 },
  { path: "app/(edit)/projects/[slug]/members/loading.tsx", head: '"flex min-h-12 items-center gap-2 {pad}"', count: 1 },
  { path: "app/(edit)/projects/[slug]/(home)/loading.tsx", head: '<div className="flex min-h-12 items-center {pad}">', count: 2 },
  { path: "app/(edit)/projects/[slug]/logs/loading.tsx", head: '<div className="flex min-h-12 items-center {pad}">', count: 1 },
  // Publish 모달의 경고 카드 — 모달 안이라 제목이 14지만 머리 여백은 같은 규격이다(옛 `py-[11px]`)
  { path: "components/publish-button.tsx", head: '"border-divider flex shrink-0 items-center gap-2 border-b {pad}"', count: 1 },
];

/**
 * ⚠️ **번역 화면의 카드 머리 셋은 높이가 고정이다** — 트리 · 목록 · 로케일 상세의 아래 선이 한 줄로 맞아야 해서 여백이 아니라
 * 높이로 든다. **48**(2026-09-28 사용자 — 다른 카드 머리의 최소 높이와 같은 값, 옛 52 = 12 + Select sm 28 + 12). 가장 높은
 * 내용물(로케일 상세의 언어 Select sm 28)은 위아래 10을 받는다. 골격과 랜딩 목업이 같은 높이를 흉내 낸다.
 */
const FIXED: { path: string; count: number }[] = [
  { path: "components/translations/workspace/tree-panel.tsx", count: 1 },
  { path: "components/translations/workspace/key-list.tsx", count: 1 },
  { path: "components/translations/workspace/locale-panel.tsx", count: 1 },
  { path: "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/loading.tsx", count: 1 },
  { path: "components/landing/mockup/translations.tsx", count: 3 },
];

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe("카드 머리 — 상하 12 · 좌우 16", () => {
  it.each(SITES)("$path", ({ path, head, count }) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    expect(occurrences(source, head.replace("{pad}", "p-4"))).toBe(0);
    // 최소 높이를 뗀 옛 줄이 남지 않는다 — Publish 모달의 경고 카드는 모달 안이라 최소 높이 밖이다.
    if (head.includes("min-h-12")) expect(occurrences(source, head.replace("{pad}", "px-4 py-3").replace("min-h-12 ", ""))).toBe(0);
    expect(occurrences(source, head.replace("{pad}", "px-4 py-3"))).toBe(count);
  });

  it.each(FIXED)("$path — 고정 머리 48", ({ path, count }) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    expect(occurrences(source, '"flex h-[52px] shrink-0 items-center gap-2 px-4"')).toBe(0);
    expect(occurrences(source, '"flex h-12 shrink-0 items-center gap-2 px-4"')).toBe(count);
  });
});
