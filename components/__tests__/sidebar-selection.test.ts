import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **LNB 선택 상태는 면 하나로만 표현한다** (2026-09-20 사용자 — DESIGN §6.5).
 *
 * ⚠️ 이 리포에 사이드바 렌더 테스트가 없어(`next/navigation` 의존) `screens.test.ts` 계열의 **소스
 * 스캔**으로 든다. 막는 것은 회귀 하나다: 선택에 굵기를 다시 얹는 것 — 라벨 폭이 함께 움직여
 * 선택을 옮길 때 글자가 흔들리고, 신호가 둘이면 면의 대비를 조정할 근거가 흐려진다.
 */
const SIDEBAR = fileURLToPath(new URL("../shell/sidebar.tsx", import.meta.url));

/** 주석을 벗긴다 — 이 파일의 주석이 **피하는 것**을 이름으로 적는다. */
const source = readFileSync(SIDEBAR, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

describe("사이드바 선택 표현", () => {
  it("항목에 굵기를 주지 않는다 — 구역 라벨의 500만 남는다", () => {
    expect(source.match(/font-medium/g)).toHaveLength(1);
    expect(source).toContain('<p className="text-foreground truncate py-1.5 text-sm font-medium">');
  });

  it("선택과 hover가 배경 알파이고 한 단계 벌어져 있다", () => {
    expect(source).toContain('active ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.03]"');
  });
});
