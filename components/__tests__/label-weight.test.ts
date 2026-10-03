import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buttonClass } from "@/components/ui/button";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const constant = (source: string, name: string) => new RegExp(`const ${name} =\\s*\\n?\\s*"([^"]+)"`).exec(source)?.[1] ?? "";

/**
 * **누르는 것의 라벨은 500(medium)이다** (2026-09-30 사용자 — 버튼 400에서 올렸다). 헤더 내비·링크도 같은 무게다(LNB 내비는 제외) —
 * 버튼 모양이 아니어도 누르는 것이므로 한 벌로 읽혀야 한다.
 */
describe("누르는 것의 라벨 weight", () => {
  it("Button은 variant와 무관하게 font-medium이다", () => {
    for (const variant of ["primary", "default", "danger", "ghost", "link"] as const) {
      const classes = buttonClass({ variant }).split(/\s+/);
      expect(classes, variant).toContain("font-medium");
      expect(classes, variant).not.toContain("font-normal");
    }
  });

  it("헤더 내비(Docs·Changelog)와 헤더 링크(GitHub·New project)도 font-medium이다", () => {
    const source = read("components/public-shell/header.tsx");
    for (const name of ["NAV_LINK", "PUBLIC_HEADER_LINK"]) {
      expect(constant(source, name).split(/\s+/), name).toContain("font-medium");
    }
  });

  // LNB 내비는 이 규칙 밖이다(2026-09-30 사용자) — Button을 빌린 접기 토글·레일 프로젝트 트리거도 옆 항목과 같은 400이다.
  it("LNB의 아이콘 버튼(`ICON_BUTTON`)은 font-normal로 되누른다", () => {
    const source = read("components/shell/sidebar.tsx");
    const classes = /const ICON_BUTTON = cn\(ROW, "([^"]+)"\)/.exec(source)?.[1] ?? "";
    expect(classes.split(/\s+/)).toContain("font-normal");
    // 소비자 둘(접기 토글 · 레일 트리거)이 그 상수를 쓴다.
    expect(source.match(/className=\{ICON_BUTTON\}/g)).toHaveLength(2);
  });
});
