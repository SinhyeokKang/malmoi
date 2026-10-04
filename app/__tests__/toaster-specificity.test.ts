import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom은 Tailwind 레이어·sonner의 레이어 밖 CSS의 우선순위를 못 계산한다 — 소스에서 `!`(important)를 고정한다.
// sonner의 `[data-sonner-toast][data-styled=true]`는 레이어 밖이라 `@layer utilities`의 일반 유틸을 이긴다(#184).
// important는 일반 선언보다 항상 이기므로 레이어 밖 규칙도 넘는다.
const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

function classNamesOf(key: string): string[] {
  const m = layout.match(new RegExp(`\\b${key}:\\s*"([^"]*)"`));
  expect(m, `Toaster classNames.${key}`).not.toBeNull();
  return (m?.[1] ?? "").split(/\s+/);
}

describe("Toaster classNames — sonner 기본 스타일을 이긴다 (#184)", () => {
  it("toast 껍데기의 radius·테두리·그림자 유틸이 전부 important다", () => {
    const toast = classNamesOf("toast");
    for (const u of ["rounded-lg!", "border-border!", "shadow-sm!"]) {
      expect(toast, u).toContain(u);
    }
  });

  it("아이콘 글리프는 16px로 못 박는다", () => {
    const icon = classNamesOf("icon");
    expect(icon).toContain("[&>svg]:size-4!");
  });
});
