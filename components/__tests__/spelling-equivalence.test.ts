import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const globalsPath = fileURLToPath(new URL("../../app/globals.css", import.meta.url));

async function declarations(candidate: string, resolveVariables = false): Promise<string[]> {
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
  const body = utilities.match(/\{([^{}]*)\}/)?.[1] ?? "";
  const found = body.split(";").map((line) => line.trim()).filter(Boolean);
  expect(found, candidate).not.toEqual([]);
  if (!resolveVariables) return found;
  // 실제 컴파일 결과의 루트 선언만 푼다. 색 합성·단위 변환·반올림은 하지 않는다.
  const variables = new Map<string, string>();
  for (const rule of css.matchAll(/:root(?:,\s*:host)?\s*\{([^{}]*)\}/g)) {
    for (const declaration of (rule[1] ?? "").matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      variables.set(declaration[1]!, declaration[2]!.trim());
    }
  }
  return found.map((declaration) => declaration.replace(/var\((--[\w-]+)\)/g, (original, name: string) => variables.get(name) ?? original));
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
