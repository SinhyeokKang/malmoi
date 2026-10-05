import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio, composite } from "./helpers/contrast";
import { oklchToSrgb, parseColor } from "./helpers/oklch";
import { readThemeTokens } from "./helpers/read-theme-tokens";

const require = createRequire(import.meta.url);
const TAILWIND_THEME = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");
const CSS = readFileSync(fileURLToPath(new URL("../../../app/globals.css", import.meta.url)), "utf8");

function hex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 대비 검사(color-scheme 완료 조건 12)의 재료 — 테스트 전용 순수 헬퍼. 지금 리포의 DESIGN 대비 수치는 손으로 잰 값이라,
 * 헬퍼가 그 수치를 **리터럴 토큰 쌍**에서 먼저 재현하는지로 헬퍼를 검증한다(design §3.3).
 */
describe("oklchToSrgb", () => {
  it("v4 팔레트 oklch를 sRGB로 바꾼다 — 기대값은 v4 변환값이다(v3 hex `#92400e`가 아니다)", () => {
    expect(hex(oklchToSrgb(0.473, 0.137, 46.201))).toBe("#973c00"); // amber-800
    expect(hex(oklchToSrgb(0.546, 0.245, 262.881))).toBe("#155dfc"); // blue-600 (v3 `#2563eb`가 아니다)
    expect(hex(oklchToSrgb(0.708, 0, 0))).toBe("#a1a1a1"); // neutral-400
  });

  it("색역 밖 채널은 0–255로 자른다(gamut mapping이 아니다)", () => {
    const { r, g, b } = oklchToSrgb(0.7, 0.4, 150); // 아주 짙은 초록 — sRGB 밖
    for (const v of [r, g, b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    expect(r).toBe(0);
  });

  it("흑백 끝점", () => {
    expect(oklchToSrgb(1, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(oklchToSrgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("parseColor", () => {
  it("리터럴 hsl()·rgb()·hex·oklch()를 푼다", () => {
    expect(parseColor("hsl(0 0% 100%)")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(hex(parseColor("hsl(0 0% 45.1%)")!)).toBe("#737373");
    expect(hex(parseColor("hsl(0 72.2% 50.6%)")!)).toBe("#dc2626");
    expect(parseColor("rgb(96 165 250)")).toEqual({ r: 96, g: 165, b: 250, a: 1 });
    expect(parseColor("rgb(22 24 27 / 0.15)")).toEqual({ r: 22, g: 24, b: 27, a: 0.15 });
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#121212")).toEqual({ r: 18, g: 18, b: 18, a: 1 });
    expect(hex(parseColor("oklch(70.8% 0 none)")!)).toBe("#a1a1a1");
  });

  it("색이 아니면 null이다", () => {
    for (const raw of ["0.75rem", "13px", "var(--x)", ""]) expect(parseColor(raw), raw).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("흑백은 21, 같은 색은 1", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
    expect(contrastRatio({ r: 80, g: 80, b: 80, a: 1 }, { r: 80, g: 80, b: 80 })).toBeCloseTo(1, 5);
  });

  it("알파가 있는 전경은 바닥 면 위에 합성한 뒤 잰다", () => {
    const half = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 });
    expect(half).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(contrastRatio({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 }))
      .toBeCloseTo(contrastRatio({ r: 127.5, g: 127.5, b: 127.5, a: 1 }, { r: 255, g: 255, b: 255 }), 10);
  });
});

describe("readThemeTokens", () => {
  it("light-dark(a, b)를 두 값으로 가른다 · var(--color-…)는 Tailwind 테마에서 · color-mix(… transparent)는 알파로", () => {
    const css = `
:root {
  --radius: 0.75rem;
  --background: light-dark(hsl(0 0% 100%), #0a0a0a);
  --warning-soft: light-dark(color-mix(in oklab, var(--color-amber-100) 80%, transparent), color-mix(in oklab, var(--color-amber-400) 16%, transparent));
  --link: var(--color-blue-600);
  --scrim: var(--foreground);
  --foreground: hsl(0 0% 3.9%);
}
:root[data-theme="dark"] { color-scheme: dark; }
`;
    const { light, dark } = readThemeTokens(css, TAILWIND_THEME);
    expect(light["--radius"]).toBeUndefined();
    expect(light["--background"]).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(dark["--background"]).toEqual({ r: 10, g: 10, b: 10, a: 1 });
    expect(light["--warning-soft"]?.a).toBeCloseTo(0.8, 10);
    expect(dark["--warning-soft"]?.a).toBeCloseTo(0.16, 10);
    expect(hex(light["--link"]!)).toBe("#155dfc");
    expect(dark["--link"]).toEqual(light["--link"]); // light-dark가 없으면 두 테마가 같은 값
    expect(light["--scrim"]).toEqual(light["--foreground"]); // 다른 루트 변수를 따라간다
  });

  it("풀 수 없는 색 참조는 조용히 빼지 않고 던진다", () => {
    expect(() => readThemeTokens(":root {\n  --x: var(--color-nope-900);\n}", TAILWIND_THEME)).toThrow(/--x/);
  });

  /**
   * DESIGN 라이트 수치 재현 — 리터럴 토큰 쌍으로만(팔레트 파생 쌍의 손 측정은 v3 hex 기준이었을 수 있다).
   * 지금 `globals.css`(아직 `light-dark()`가 없다)에서 읽는다.
   */
  it("지금 globals.css에서 DESIGN 라이트 대비 수치를 재현한다 — DESIGN은 소수 둘째 자리를 손으로 반올림했다(실측 4.74 · 4.35 · 4.83 · 2.54)", () => {
    const { light, dark } = readThemeTokens(CSS, TAILWIND_THEME);
    const on = (fg: string, bg: string) => contrastRatio(light[fg]!, composite(light[bg]!, { r: 255, g: 255, b: 255 }));
    expect(on("--muted-foreground", "--background")).toBeCloseTo(4.75, 1); // DESIGN §2.2
    expect(on("--muted-foreground", "--muted")).toBeCloseTo(4.34, 1); // DESIGN §2.2
    expect(on("--destructive", "--background")).toBeCloseTo(4.83, 1); // DESIGN §2.3
    expect(on("--ring", "--background")).toBeCloseTo(2.54, 1); // DESIGN §7 링
    // Phase 2부터 테마 토큰은 `light-dark()`다 — 다크 쪽이 시안 값(README §5)으로 풀린다.
    expect(dark).not.toEqual(light);
    expect(hex(dark["--background"]!)).toBe(hex(parseColor("oklch(20.5% 0 0)")!)); // neutral-900
    expect(dark["--hue-amber"]).toEqual(light["--hue-amber"]); // 테마 불변 토큰은 두 테마가 같다
  });
});
