import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **`asChild`를 받는 프리미티브가 형제 노드를 렌더하면 Radix Slot이 던진다.**
 *
 * `Slot`은 자식이 **정확히 하나의 React 엘리먼트**일 때만 그 태그에 props를 얹을 수 있다. 프리미티브가
 * `{children}{selected && <Check/>}`처럼 형제를 붙이면 자식이 둘이 되고, 호출부가 `asChild`를 주는
 * 순간 ``Primitive.div failed to slot onto its children. Expected a single React element child or
 * `Slottable`.``로 **던진다** — 그러면 그 컴포넌트를 든 트리가 통째로 죽는다.
 *
 * ⚠️ **실측 (2026-09-09)**: 사이드바의 프로젝트 스위처를 **한 번 열면** 셸이 "This page couldn't load"로
 * 죽었다. `DropdownMenuItem asChild selected={...}`가 그 조합이고, `add099a`(6a ship 2)부터
 * **프로덕션에 있었다.** 게이트 셋(`typecheck`·`test` 2,188건·`build`)이 전부 green이었다 —
 * 렌더되는 것과 클릭했을 때 사는 것은 다른 사실이고, 이 리포는 같은 모양을 한 번 밟았다
 * (POSTMORTEM 2026-09-08 — 툴팁 provider, 접기 버튼 한 번에 죽었다).
 *
 * 해법은 `Slot.Slottable`이다: 어느 자식을 슬롯 대상으로 삼을지 알려 주면 형제가 허용된다.
 * 렌더 테스트를 두지 않는 리포라(design §4) 소스로 센다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const UI = join(ROOT, "components/ui");

/** 주석을 벗긴다 — docstring이 자기가 피하는 것을 이름으로 적는다. */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const FILES = readdirSync(UI)
  .filter((name) => name.endsWith(".tsx") && statSync(join(UI, name)).isFile())
  .map((name) => ({ name, source: strip(readFileSync(join(UI, name), "utf8")) }));

describe("Slot에 형제를 넘기지 않는다", () => {
  it("프리미티브를 읽었다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  const SIBLING_AFTER_CHILDREN = /\{children\}\s*\n\s*\{/;
  /**
   * ⚠️ **`asChild`가 닿을 수 있는 프리미티브만 대상이다.** Radix `Primitive.*`에 `{...props}`를
   * 흘려보내는 것이 그 조건이다 — `FormGroup`처럼 자기 `<div>`만 그리는 래퍼는 형제를 렌더해도
   * Slot을 지나지 않는다. 좁히지 않으면 오탐이 쌓여 아무도 안 보는 검사가 된다.
   */
  const slottable = (file: { source: string }): boolean =>
    /Primitive\./.test(file.source) && /\{\.\.\.props\}/.test(file.source);

  it("`{children}` 옆에 형제를 렌더하는 자리는 `Slottable`을 지난다", () => {
    const offenders = FILES.filter(
      (file) => slottable(file) && SIBLING_AFTER_CHILDREN.test(file.source) && !/Slottable/.test(file.source),
    ).map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it("검사식이 실제로 그 형태를 잡는다 — 공허하게 통과하지 않는다", () => {
    expect(SIBLING_AFTER_CHILDREN.test("      {children}\n      {selected && <Check />}")).toBe(true);
    expect(SIBLING_AFTER_CHILDREN.test("      {children}\n    </Primitive.Item>")).toBe(false);
    // 좁힘이 실제로 좁힌다 — `asChild`가 닿지 않는 래퍼는 대상이 아니다.
    expect(slottable({ source: "<div>{children}</div>" })).toBe(false);
    expect(slottable({ source: "<Primitive.Item {...props}>{children}</Primitive.Item>" })).toBe(true);
  });

  /**
   * ⚠️ **`DropdownMenuItem`을 이름으로 고정한다.** 위 검사는 형태를 보므로, 누가 형제를 `<>…</>`로
   * 합치거나 삼항으로 바꾸면 통과한다 — 실제로 죽은 자리는 이것 하나이고 그 이름이 방어선이다.
   */
  it("`DropdownMenuItem`이 children을 `Slottable`로 감싼다", () => {
    const dropdown = FILES.find((f) => f.name === "dropdown-menu.tsx");
    expect(dropdown).toBeDefined();
    const body = (dropdown?.source ?? "").slice((dropdown?.source ?? "").indexOf("export function DropdownMenuItem"));
    expect(body).toMatch(/<Slot\.Slottable>\s*\{children\}\s*<\/Slot\.Slottable>/);
  });
});
