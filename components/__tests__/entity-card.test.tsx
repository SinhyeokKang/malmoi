// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

import { render, find } from "@/components/__tests__/helpers/dom";
import { EntityCard } from "@/components/ui/entity-card";

const ROOT = process.cwd();
// ⚠️ **주석을 벗기고 센다** — 프리미티브가 자기 치수를 설명하므로 그 문장이 검사를 거짓으로 만든다.
const SOURCE = readFileSync(join(ROOT, "components/ui/entity-card.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

/**
 * `EntityCard` — "지금 다루는 대상 하나"를 보이는 프리미티브 (DESIGN §6.4).
 *
 * ⚠️ **`kind`가 없다** — 이 배송의 소비자는 병합 화면 하나이고, 초대의 프로젝트 카드는
 * 형이 다르다(글리프 폴백 · 라운드 사각 · 우측 국기). 둘이 진짜 같아지는 순간 올린다.
 */
it("대상 하나를 아바타·두 줄·우측 슬롯으로 그린다", async () => {
  const { container } = await render(
    <EntityCard name="s***@example.com" secondary="GitHub · Joined Sep 2026" meta={<span data-testid="mark">gh</span>} />,
  );
  expect(container.textContent).toContain("s***@example.com");
  expect(container.textContent).toContain("GitHub · Joined Sep 2026");
  expect(find(container, "[data-testid='mark']")).not.toBeNull();
});

it("긴 값이 카드를 넓히지 않는다 — 320 컬럼 안이다", () => {
  // ⚠️ 폭은 렌더 결과라 스캔이 못 보지만 **원인은 소스의 클래스**다 (`translations-screen`과 같은 형).
  expect(SOURCE).toContain("min-w-0");
  expect(SOURCE).toContain("truncate");
});

/**
 * ⚠️ **박스 radius 12는 `rounded-lg`다** — 이 리포에서 `--radius-xl`은 16이라, `rounded-xl`을 쓰면
 * 같은 화면의 `Card`·`Alert`·`Dialog`(전부 12) 사이에서 **작은 카드 하나만 더 둥글어진다**.
 */
it("박스 규격이 같은 화면의 다른 카드와 같다", () => {
  expect(SOURCE).toContain("rounded-lg");
  expect(SOURCE).not.toContain("rounded-xl");
  expect(SOURCE).toMatch(/border-border/);
});

/**
 * ⚠️ **`components/ui/`가 기능 디렉터리를 import하지 않는다** — `LocaleFlag`는
 * `components/translations/`의 export이고, 프리미티브가 그것을 물면 `ui/`가 잎에 가깝다는 성질이
 * 깨진다 (`client-graph.test.ts`는 무거운 모듈만 보므로 그것을 막지 않는다).
 */
it("기능 디렉터리를 물지 않는다", () => {
  for (const forbidden of ["@/components/translations", "@/components/members", "@/lib/db", "@/app/"]) {
    expect(SOURCE).not.toContain(forbidden);
  }
});
