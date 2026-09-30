import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * **배지 라벨은 12px다** (2026-09-30 사용자). `text-xs`가 13px로 덮여 있어(`app/globals.css`) 12px는 **토큰 `text-2xs`**가 든다 —
 * 임의값 `text-[12px]`는 visual-system 게이트가 막고 자간 짝(0.02em)도 잃는다.
 */
describe("배지 라벨 12px", () => {
  it("text-2xs 토큰이 12px이고 자간·행간 짝을 든다", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/--text-2xs:\s*12px;/);
    expect(css).toMatch(/--text-2xs--letter-spacing:\s*0\.02em;/);
    // 행간을 안 주면 부모 것을 물려받아 배지 높이가 자리마다 갈린다 — 12 × 4/3 = 16이라 알약 높이 20이 유지된다.
    expect(css).toMatch(/--text-2xs--line-height:\s*calc\(1 \/ 0\.75\);/);
  });

  // Badge 프리미티브 + 랜딩 목업의 손으로 만든 개수 알약(Publish 버튼 복제). 실물 Publish 버튼은 2026-10-01부터 `CountBadge`다.
  it.each(["components/ui/badge.tsx", "components/landing/mockup/translations.tsx"])(
    "%s의 알약이 text-2xs다",
    (path) => {
      const pills = [...read(path).matchAll(/"[^"]*rounded-full px-1\.5[^"]*"/g)].map((match) => match[0]);
      expect(pills.length, path).toBeGreaterThan(0);
      for (const pill of pills) {
        expect(pill.split(/[\s"]+/), path).toContain("text-2xs");
        expect(pill.split(/[\s"]+/), path).not.toContain("text-xs");
      }
    },
  );
});
