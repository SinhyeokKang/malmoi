import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio } from "./helpers/contrast";
import type { Rgb, Rgba } from "./helpers/oklch";
import { readThemeTokens } from "./helpers/read-theme-tokens";

const require = createRequire(import.meta.url);
const TOKENS = readThemeTokens(
  readFileSync(fileURLToPath(new URL("../../../app/globals.css", import.meta.url)), "utf8"),
  readFileSync(require.resolve("tailwindcss/theme.css"), "utf8"),
);

/**
 * **대비는 이름이 아니라 값으로 두 테마에서 잰다** (color-scheme spec 완료 조건 12 · design §4.4).
 *
 * ⚠️ 2026-09-11 `--ring`은 검사가 green인 채로 화면에 안 보였다(1.19:1) — 그 검사는 이름·존재만 셌다. 여기는 `globals.css`의
 * `light-dark()` 두 값을 풀어 실제 비율을 계산한다. 알파 면(`@N%` · 토큰 자체가 `color-mix`)은 바닥 면 `background` 위에 먼저 깐다.
 */
type Side = "light" | "dark";
type Surface = string | { token: string; alpha: number; on?: string };
type Pair = { id: string; fg: string; fgAlpha?: number; bg: Surface; floor: 4.5 | 3 };

function surface(side: Side, bg: Surface): Rgb {
  const tokens = TOKENS[side];
  const base = composite(tokens["--background"]!, { r: 0, g: 0, b: 0 });
  const spec = typeof bg === "string" ? { token: bg, alpha: 1, on: "--background" } : { on: "--background", ...bg };
  const under = spec.on === "--background" ? base : composite(tokens[spec.on]!, base);
  const top = tokens[spec.token]!;
  return composite({ ...top, a: top.a * spec.alpha }, under);
}

function ratio(side: Side, { fg, fgAlpha = 1, bg }: Pair): number {
  const color: Rgba = TOKENS[side][fg]!;
  return contrastRatio({ ...color, a: color.a * fgAlpha }, surface(side, bg));
}

const HUES = ["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"] as const;

/** design §4.4 — 본문 AA(4.5) · 비텍스트(3). 구조 선(`border`·`divider`·`border-subtle`)은 두 테마 모두 의도적으로 미달이라 넣지 않는다(design §3.8). */
const PAIRS: readonly Pair[] = [
  ...["--background", "--popover", "--canvas", "--muted"].map((bg) => ({ id: `foreground/${bg.slice(2)}`, fg: "--foreground", bg, floor: 4.5 as const })),
  // DESIGN §2.2의 muted 면 처방 — muted 위 글자는 `text-foreground/60`.
  { id: "foreground@60%/muted", fg: "--foreground", fgAlpha: 0.6, bg: "--muted", floor: 4.5 },
  ...["--background", "--canvas", "--popover", "--muted"].map((bg) => ({ id: `muted-foreground/${bg.slice(2)}`, fg: "--muted-foreground", bg, floor: 4.5 as const })),
  { id: "primary-foreground/primary", fg: "--primary-foreground", bg: "--primary", floor: 4.5 },
  { id: "destructive/background", fg: "--destructive", bg: "--background", floor: 4.5 },
  { id: "destructive/destructive@8%", fg: "--destructive", bg: { token: "--destructive", alpha: 0.08 }, floor: 4.5 },
  { id: "link/background", fg: "--link", bg: "--background", floor: 4.5 },
  ...["--success-soft", "--success-surface", "--background"].map((bg) => ({ id: `success-foreground/${bg.slice(2)}`, fg: "--success-foreground", bg, floor: 4.5 as const })),
  // `ui/row-card.tsx` BannerLine은 `bg-foreground/[0.02]`, 곧 사실상 background 위다(RA 🟡3).
  ...["--warning-soft", "--background"].map((bg) => ({ id: `warning-soft-foreground/${bg.slice(2)}`, fg: "--warning-soft-foreground", bg, floor: 4.5 as const })),
  { id: "warning-foreground/background", fg: "--warning-foreground", bg: "--background", floor: 4.5 },
  { id: "diff-removed/background", fg: "--diff-removed", bg: "--background", floor: 4.5 },
  { id: "diff-added/background", fg: "--diff-added", bg: "--background", floor: 4.5 },
  // 낱말 면 위 글자 — `bg-diff-removed/[0.14]` · `bg-diff-added/[0.16]`.
  { id: "foreground/diff-removed@14%", fg: "--foreground", bg: { token: "--diff-removed", alpha: 0.14 }, floor: 4.5 },
  { id: "foreground/diff-added@16%", fg: "--foreground", bg: { token: "--diff-added", alpha: 0.16 }, floor: 4.5 },
  ...["blue", "teal", "violet"].map((kind) => ({ id: `kind-${kind}/kind-${kind}-surface`, fg: `--kind-${kind}`, bg: `--kind-${kind}-surface`, floor: 4.5 as const })),
  // 비텍스트 3:1 — 포커스 링 · 썸네일 글리프.
  { id: "ring/background", fg: "--ring", bg: "--background", floor: 3 },
  ...HUES.map((hue) => ({ id: `on-hue/hue-${hue} (thumbnail glyph)`, fg: "--on-hue", bg: `--hue-${hue}`, floor: 3 as const })),
  // 글자 4.5 — 아바타 이니셜(수용 예외).
  ...HUES.map((hue) => ({ id: `on-hue/hue-${hue} (avatar initial)`, fg: "--on-hue", bg: `--hue-${hue}`, floor: 4.5 as const })),
  ...["--background", "--canvas"].map((bg) => ({ id: `gray-dim/${bg.slice(2)}`, fg: "--gray-dim", bg, floor: 4.5 as const })),
];

/**
 * **수용 예외 — 이 표 밖은 하한 미달이 곧 red다** (spec 완료 조건 12 — 여섯뿐). 수치는 이 헬퍼의 실측을 소수 둘째 자리에서 **내린** 값이고,
 * 다크에서도 미달인 같은 자리만 다크 칸을 든다. 근거 없는 예외가 늘지 않게 DESIGN 절을 같이 적는다.
 */
const ACCEPTED: Readonly<Record<string, { light?: number; dark?: number; why: string }>> = {
  "ring/background": { light: 2.54, why: "DESIGN §7 — blue-400 링, 시각 무게를 대비보다 앞에 둔 결정(2026-09-11). 다크 blue-500은 통과" },
  "destructive/destructive@8%": { light: 4.26, why: "DESIGN §2.3 — 실패 알약·칸의 글자(약 4.3)" },
  "muted-foreground/muted": { light: 4.34, why: "DESIGN §2.2 — muted 위 글자는 `text-foreground/60`을 쓴다(4.34)" },
  "muted-foreground/canvas": { light: 4.38, why: "DESIGN §2.2 · §7 — canvas 위 muted 글자(셸 사이드바·헤더), muted-foreground/muted와 같은 성격, Phase 1 라이트 무변화(2026-10-05 사용자)" },
  // 아바타 이니셜 — 식별색 위 흰 글자(테마 불변이라 두 테마 같은 수치). rose·indigo·fuchsia는 4.5를 넘어 예외가 아니다. DESIGN §6.2 · §7.
  ...Object.fromEntries(
    ([["orange", 3.59], ["amber", 3.19], ["emerald", 3.65], ["teal", 3.66], ["sky", 4.02]] as const).map(([hue, value]) => [
      `on-hue/hue-${hue} (avatar initial)`,
      { light: value, dark: value, why: "DESIGN §6.2 · §7 — 아바타 이니셜, 식별색 위 흰 글자, 라이트 최저 amber 3.19" },
    ]),
  ),
  "gray-dim/background": { light: 2.58, dark: 3.78, why: "DESIGN §6.2 — 본문 아님, 옆 값이 뜻을 완성하는 자리만(2026-10-05 사용자 — 다섯째 예외)" },
  "gray-dim/canvas": { light: 2.38, dark: 4.17, why: "DESIGN §6.2 — 위와 같은 자리(검색 Dialog 그룹 머리 등)" },
};

describe.each(["light", "dark"] as const)("대비 — %s", (side) => {
  it.each(PAIRS.map((pair) => [pair.id, pair] as const))("%s", (_, pair) => {
    const accepted = ACCEPTED[pair.id]?.[side];
    const measured = ratio(side, pair);
    if (accepted === undefined) {
      expect(measured, `${pair.id} (${side}) ${measured.toFixed(2)}`).toBeGreaterThanOrEqual(pair.floor);
    } else {
      // 수용 예외도 더 나빠지면 red다. 하한을 넘었으면 예외가 낡은 것이니 표에서 지운다.
      expect(measured, `${pair.id} (${side}) ${measured.toFixed(2)}`).toBeGreaterThanOrEqual(accepted);
      expect(measured, `${pair.id} (${side}) — 하한을 넘었다, ACCEPTED에서 지운다`).toBeLessThan(pair.floor);
    }
  });
});

describe("대비 수용 예외 표", () => {
  it("예외마다 실재하는 쌍이고 근거가 있다", () => {
    const ids = new Set(PAIRS.map((pair) => pair.id));
    for (const [id, entry] of Object.entries(ACCEPTED)) {
      expect(ids.has(id), id).toBe(true);
      expect(entry.why, id).not.toBe("");
      expect(entry.light ?? entry.dark, id).toBeDefined();
    }
  });

  /** spec 완료 조건 12 — 예외의 **종류**는 여섯이다(링 · 실패 알약 · muted 위 · canvas 위 · 아바타 이니셜 · gray-dim). */
  it("예외의 종류가 여섯을 넘지 않는다", () => {
    const kinds = new Set(Object.keys(ACCEPTED).map((id) => id.replace(/^on-hue\/hue-\w+ \(avatar initial\)$/, "avatar").replace(/^gray-dim\/.*$/, "gray-dim")));
    expect([...kinds].sort()).toEqual(["avatar", "destructive/destructive@8%", "gray-dim", "muted-foreground/canvas", "muted-foreground/muted", "ring/background"]);
  });
});
