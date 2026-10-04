import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const globalsPath = fileURLToPath(new URL("../../app/globals.css", import.meta.url));

async function compiled(candidate: string): Promise<{ css: string; utilities: string }> {
  const compiler = await compile(readFileSync(globalsPath, "utf8"), {
    base: dirname(globalsPath),
    loadStylesheet: async (id, base) => {
      const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  const css = compiler.build([candidate]);
  if (candidate.startsWith("tracking-")) {
    expect(css).toMatch(/@property --tw-tracking \{\s*syntax: "\*";\s*inherits: false;\s*\}/);
  }
  const utilities = css.split("@layer utilities {")[1]?.split("\n}")[0] ?? "";
  expect(utilities.trim(), `${candidate} emits CSS`).not.toBe("");
  return { css, utilities };
}

function resolved(css: string, value: string): string {
  // 실제 루트 선언만 푼다. 색 합성·단위 변환·반올림은 하지 않는다.
  // ⚠️ `:root`의 `color-mix` 값에는 Tailwind가 폴백 + `@supports` 재선언을 붙인다 — 한 단계 중첩까지 읽고 뒤 선언(최신 브라우저 값)이 이긴다.
  const variables = new Map<string, string>();
  for (const rule of css.matchAll(/:root(?:,\s*:host)?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    for (const declaration of (rule[1] ?? "").matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      variables.set(declaration[1]!, declaration[2]!.trim());
    }
  }
  const expand = (input: string, seen: Set<string>): string => input.replace(/var\((--[\w-]+)\)/g, (original, name: string) => {
    const target = variables.get(name);
    if (target === undefined || seen.has(name)) return original;
    return expand(target, new Set([...seen, name]));
  });
  return expand(value, new Set());
}

async function declarations(candidate: string, resolveVariables = false): Promise<string[]> {
  const { css, utilities } = await compiled(candidate);
  const body = utilities.match(/\{([^{}]*)\}/)?.[1] ?? "";
  const found = body.split(";").map((line) => line.trim()).filter(Boolean);
  expect(found, candidate).not.toEqual([]);
  if (!resolveVariables) return found;
  return found.map((declaration) => resolved(css, declaration));
}

/** 루트 클래스 이름만 지운다. 자식 선택자·미디어·컨테이너 연산자는 비교에 남긴다. */
async function utility(candidate: string): Promise<string> {
  const { css, utilities } = await compiled(candidate);
  const escaped = candidate.replace(/[^\w-]/g, "\\$&");
  expect(utilities).toContain(`.${escaped}`);
  return resolved(css, utilities.replaceAll(`.${escaped}`, ".candidate"));
}

describe("T1 철자 쌍의 Tailwind 선언", () => {
  it.each([
    ["leading-[1.5]", "leading-normal"],
    ["[overflow-wrap:anywhere]", "wrap-anywhere"],
    ["bg-foreground/2", "bg-foreground/[0.02]"],
    ["bg-foreground/3", "bg-foreground/[0.03]"],
  ])("%s → %s 선언이 같다", async (oldSpelling, newSpelling) => {
    expect(await declarations(oldSpelling, true)).toEqual(await declarations(newSpelling, true));
  });

  it.each([
    ["text-xs", "tracking-[0.02em]"],
    ["text-base", "tracking-[0.015em]"],
    ["text-xl", "tracking-[0.005em]"],
  ])("%s가 %s의 자간을 이미 든다", async (size, tracking) => {
    const sizeSpacing = (await declarations(size, true)).find((line) => line.startsWith("letter-spacing:"));
    const trackingSpacing = (await declarations(tracking, true)).find((line) => line.startsWith("letter-spacing:"));
    expect(sizeSpacing).toBeDefined();
    expect(trackingSpacing).toBeDefined();
    // --tw-tracking은 inherits:false이고 initial-value가 없어 생략 시 크기 토큰의 fallback이다.
    expect(sizeSpacing?.replace(/var\(--tw-tracking, ([^)]+)\)/, "$1")).toBe(trackingSpacing);
  });

  it.each([
    ["border-foreground/[0.06]", "border-divider"],
    ["ring-foreground/[0.06]", "ring-divider"],
    ["rounded-[4px]", "rounded"],
    ["bg-foreground/7", "bg-foreground/[0.07]"],
  ])("%s → %s는 선언이 달라 교체하지 않는다", async (oldSpelling, newSpelling) => {
    expect(await declarations(oldSpelling, true)).not.toEqual(await declarations(newSpelling, true));
  });

  it("다른 줄바꿈 값은 동치로 판정하지 않는다 (카나리아)", async () => {
    expect(await declarations("[overflow-wrap:anywhere]")).not.toEqual(await declarations("wrap-break-word"));
  });

  it("다른 행간·자간을 변수 해석으로 동치 취급하지 않는다 (카나리아)", async () => {
    expect(await declarations("leading-[1.6]", true)).not.toEqual(await declarations("leading-normal", true));
    expect(await declarations("tracking-[0.02em]", true)).not.toEqual(await declarations("tracking-[0.015em]", true));
  });
});

// T2 시작 시의 실제 utility 59형 + 색 수정자·별도 속성 카나리아.
describe("T2 토큰은 값과 적용 경계를 보존한다", () => {
  it.each([
    ["@max-[640px]:basis-full", "@max-form:basis-full"],
    ["@max-[640px]:col-start-2", "@max-form:col-start-2"],
    ["@max-[640px]:empty:hidden", "@max-form:empty:hidden"],
    ["@max-[640px]:flex-1", "@max-form:flex-1"],
    ["@max-[640px]:flex-wrap", "@max-form:flex-wrap"],
    ["@max-[640px]:grid", "@max-form:grid"],
    ["@max-[640px]:grid-cols-[28px_1fr]", "@max-form:grid-cols-[28px_1fr]"],
    ["@max-[640px]:items-start", "@max-form:items-start"],
    ["@max-[640px]:justify-self-start", "@max-form:justify-self-start"],
    ["@max-[640px]:min-w-0", "@max-form:min-w-0"],
    ["@max-[640px]:ml-0", "@max-form:ml-0"],
    ["@max-[640px]:order-last", "@max-form:order-last"],
    ["@max-[640px]:w-full", "@max-form:w-full"],
    ["@min-[640px]:gap-y-[14px]", "@min-form:gap-y-[14px]"],
    ["@min-[640px]:grid-cols-[96px_1fr]", "@min-form:grid-cols-[96px_1fr]"],
    ["[&_a]:text-blue-600", "[&_a]:text-link"],
    ["[&_p]:leading-[1.6]", "[&_p]:leading-body"],
    ["[&_td]:leading-[1.6]", "[&_td]:leading-body"],
    ["[&_th]:leading-[1.6]", "[&_th]:leading-body"],
    ["border-neutral-300", "border-gray-light"],
    ["gap-[3px]", "gap-copy-gap"],
    ["h-[min(640px,calc(100svh-96px))]", "h-[min(640px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["h-[min(680px,calc(100svh-96px))]", "h-[min(680px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["leading-[1.55]", "leading-translation"],
    ["leading-[1.6]", "leading-body"],
    ["leading-[1.7]", "leading-prose"],
    ["max-h-[calc(100svh-96px)]", "max-h-[calc(100svh-var(--spacing-modal-gutter))]"],
    ["max-h-[min(380px,calc(100svh-96px))]", "max-h-[min(380px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(400px,calc(100svh-96px))]", "max-h-[min(400px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(440px,calc(100svh-96px))]", "max-h-[min(440px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(460px,calc(100svh-96px))]", "max-h-[min(460px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(480px,calc(100svh-96px))]", "max-h-[min(480px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(500px,calc(100svh-96px))]", "max-h-[min(500px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(600px,calc(100svh-96px))]", "max-h-[min(600px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(680px,calc(100svh-96px))]", "max-h-[min(680px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["max-h-[min(800px,calc(100svh-96px))]", "max-h-[min(800px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(340px,calc(100svh-96px))]", "min-h-[min(340px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(360px,calc(100svh-96px))]", "min-h-[min(360px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(400px,calc(100svh-96px))]", "min-h-[min(400px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(420px,calc(100svh-96px))]", "min-h-[min(420px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(440px,calc(100svh-96px))]", "min-h-[min(440px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(460px,calc(100svh-96px))]", "min-h-[min(460px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(560px,calc(100svh-96px))]", "min-h-[min(560px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(620px,calc(100svh-96px))]", "min-h-[min(620px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-[min(80svh,800px,calc(100svh-96px))]", "min-h-[min(80svh,800px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-w-[1280px]", "min-w-shell-min"],
    ["py-[13px]", "py-row-y"],
    ["space-y-[3px]", "space-y-copy-gap"],
    ["text-blue-600", "text-link"],
    ["text-neutral-300", "text-gray-light"],
    ["text-neutral-400", "text-gray-dim"],
    ["text-neutral-600", "text-gray-strong"],
    ["w-[calc(100%-96px)]", "w-[calc(100%-var(--spacing-modal-gutter))]"],
    ["@max-[640px]:[&>fieldset]:col-start-2", "@max-form:[&>fieldset]:col-start-2"],
    ["@max-[640px]:[&>a]:col-start-2", "@max-form:[&>a]:col-start-2"],
    ["@max-[640px]:[&>a]:justify-self-start", "@max-form:[&>a]:justify-self-start"],
    ["@max-[640px]:[&>[data-archive-card]]:col-start-2", "@max-form:[&>[data-archive-card]]:col-start-2"],
    ["@max-[640px]:[&>[data-archive-card]]:justify-self-start", "@max-form:[&>[data-archive-card]]:justify-self-start"],
    ["hover:text-blue-600", "hover:text-link"],
    ["hover:text-neutral-300", "hover:text-gray-light"],
    ["hover:text-neutral-400", "hover:text-gray-dim"],
    ["hover:text-neutral-600", "hover:text-gray-strong"],
    ["focus:placeholder-blue-600", "focus:placeholder-link"],
    ["focus:placeholder-neutral-300", "focus:placeholder-gray-light"],
    ["focus:placeholder-neutral-400", "focus:placeholder-gray-dim"],
    ["focus:placeholder-neutral-600", "focus:placeholder-gray-strong"],
    ["caret-blue-600", "caret-link"],
    ["caret-neutral-300", "caret-gray-light"],
    ["caret-neutral-400", "caret-gray-dim"],
    ["caret-neutral-600", "caret-gray-strong"],
    ["accent-blue-600", "accent-link"],
    ["accent-neutral-300", "accent-gray-light"],
    ["accent-neutral-400", "accent-gray-dim"],
    ["accent-neutral-600", "accent-gray-strong"],
    ["border-t-blue-600", "border-t-link"],
    ["border-t-neutral-300", "border-t-gray-light"],
    ["border-t-neutral-400", "border-t-gray-dim"],
    ["border-t-neutral-600", "border-t-gray-strong"],
  ])("%s → %s 전체 utility가 같다", async (before, after) => {
    expect(await utility(before)).toBe(await utility(after));
  });

  it("컨테이너 경계 연산자와 자식 선택자를 지우지 않는다 (카나리아)", async () => {
    const max = await utility("@max-form:w-full");
    const min = await utility("@min-form:w-full");
    expect(max).toContain("@container (width < 640px)");
    expect(min).toContain("@container (width >= 640px)");
    expect(max).not.toBe(min);
    expect(max).not.toBe(await utility("@max-[641px]:w-full"));
    expect(await utility("[&_p]:leading-body")).not.toBe(await utility("[&_td]:leading-body"));
  });

  it("추가한 열두 토큰의 값·`:root` 별칭이 승인 표와 같다", () => {
    const theme = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(readFileSync(globalsPath, "utf8"))?.[1] ?? "";
    const values = new Map([...theme.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2]?.trim()]));
    for (const [name, value] of Object.entries({
      // 팔레트 값은 color-scheme Phase 1에서 `:root`로 내려갔다 — 라이트 값 대조는 `globals-css.test.ts`가 든다.
      "--color-link": "var(--link)",
      "--color-gray-light": "var(--gray-light)",
      "--color-gray-dim": "var(--gray-dim)",
      "--color-gray-strong": "var(--gray-strong)",
      "--leading-body": "1.6",
      "--leading-prose": "1.7",
      "--leading-translation": "1.55",
      "--spacing-row-y": "13px",
      "--spacing-copy-gap": "3px",
      "--spacing-modal-gutter": "96px",
      "--container-form": "640px",
      "--spacing-shell-min": "1280px",
    })) expect(values.get(name), name).toBe(value);
  });
});

/**
 * **color-scheme Phase 1 — 의미 색 유틸이 생성되고 옛 raw와 같은 색이다** (design §2.4 · 2026-09-23 `text-link` 함정).
 *
 * ⚠️ 옛 알파 철자(`bg-green-100/80`)는 폴백 + `@supports` 두 선언을 낸다 — 비교는 **최신 브라우저가 쓰는 마지막 선언**을 루트 변수로 푼 값이다.
 * 새 토큰은 `:root`의 `color-mix`가 같은 식을 든다.
 */
const PROPERTY: Readonly<Record<string, string>> = { bg: "background-color", text: "color", border: "border-color" };

async function effective(candidate: string): Promise<string> {
  const { css, utilities } = await compiled(candidate);
  const property = PROPERTY[/^(?:[a-z-]+:)*(bg|text|border)-/.exec(candidate)?.[1] ?? ""];
  expect(property, candidate).toBeDefined();
  const values = [...utilities.matchAll(new RegExp(`(?<![\\w-])${property}:\\s*([^;]+);`, "g"))].map((match) => match[1]!.trim());
  expect(values, candidate).not.toEqual([]);
  return resolved(css, values.at(-1)!);
}

describe("color-scheme 의미 색은 옮겨 온 raw와 같은 색이다", () => {
  it.each([
    ["bg-green-50", "bg-success-surface"],
    ["bg-green-100/80", "bg-success-soft"],
    ["text-green-800", "text-success-foreground"],
    ["bg-amber-50", "bg-warning-surface"],
    ["bg-amber-100/80", "bg-warning-soft"],
    ["text-amber-800", "text-warning-soft-foreground"],
    ["text-amber-700", "text-warning-foreground"],
    ["bg-amber-500", "bg-warning-emphasis"],
    ["border-amber-500/50", "border-warning-emphasis/50"],
    ["bg-red-50", "bg-danger-surface"],
    ["bg-blue-50", "bg-info-surface"],
    ["bg-rose-600", "bg-hue-rose"],
    ["bg-orange-600", "bg-hue-orange"],
    ["bg-amber-600", "bg-hue-amber"],
    ["bg-emerald-600", "bg-hue-emerald"],
    ["bg-teal-600", "bg-hue-teal"],
    ["bg-sky-600", "bg-hue-sky"],
    ["bg-indigo-600", "bg-hue-indigo"],
    ["bg-fuchsia-600", "bg-hue-fuchsia"],
    ["text-white", "text-on-hue"],
    ["bg-foreground/40", "bg-scrim/40"],
    ["bg-foreground/32", "bg-scrim/32"],
    // T2 쌍. `link`가 `:root` 변수가 되면서 color-mix 미지원 브라우저용 폴백만 단색이 됐다(값을 못 푸는 토큰 알파의 공통 형 — `bg-foreground/40`과 같다).
    ["bg-blue-600/[0.14]", "bg-link/[0.14]"],
  ])("%s → %s", async (before, after) => {
    expect(await effective(after)).toBe(await effective(before));
  });

  it("다른 단계·다른 뜻은 같다고 판정하지 않는다 (카나리아)", async () => {
    expect(await effective("text-warning-foreground")).not.toBe(await effective("text-amber-800"));
    expect(await effective("bg-success-soft")).not.toBe(await effective("bg-green-100"));
    expect(await effective("bg-scrim/32")).not.toBe(await effective("bg-foreground/40"));
  });

  it("그림자 둘이 옛 리터럴과 같은 색을 낸다 — srgb 혼합은 `rgb(r g b / a)`와 같은 색이다", async () => {
    const { css } = await compiled("shadow-low");
    expect(resolved(css, "var(--shadow-color)")).toBe("rgb(22 24 27)");
    expect(css).toMatch(/0 4px 12px 4px var\(--tw-shadow-color, color-mix\(in srgb, var\(--shadow-color\) 5%, transparent\)\)/);
    expect((await compiled("shadow-medium")).css).toMatch(/0 6px 16px 2px var\(--tw-shadow-color, color-mix\(in srgb, var\(--shadow-color\) 15%, transparent\)\)/);
  });
});
