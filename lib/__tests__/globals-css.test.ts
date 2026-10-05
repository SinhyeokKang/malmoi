import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `text-mono`가 **글꼴까지** 싣는지 텍스트로 본다 (DESIGN §4.1).
 *
 * 2026-09-06까지 `@theme inline`의 `--text-mono`(font-size 토큰)뿐이어서 13px/18px만 실리고 font-family는
 * 안 실렸다 — 키·slug·초대 링크가 전부 13px **sans**로 렌더됐고, 이름이 mono라 아무도 의심하지 않았다
 * (`/doc-check` 1회차). 소비 경로가 유틸 하나인 것이 설계라, 그 유틸이 셋(글꼴·크기·행간)을 다 들어야 한다.
 */
const CSS = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

const SOURCE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "__tests__" || /\.test\./.test(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? productionFiles(path) : /\.(?:[jt]sx?|css|svg)$/.test(entry.name) ? [path] : [];
  });
}

/** 등록·루트 선언은 소비가 아니다. 주석에 든 예시도 빼고 실제 코드/스타일만 센다. */
function consumingSource(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
    .replace(/(?:@theme(?:\s+inline)?|:root)\s*\{[^{}]*\}/g, "");
}

function colorUses(source: string, name: string, target: string): string[] {
  const properties = "bg|text|border(?:-[trblxyse])?|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|placeholder|caret|accent";
  return [...consumingSource(source).matchAll(new RegExp(
    `(?<![\\w-])(?:${properties})-${name}(?![\\w-])|(?<![\\w-])(?:--color-${name}|${target})(?![\\w-])`, "g",
  ))].map((match) => match[0]);
}

describe("globals.css — text-mono 유틸", () => {
  const block = /@utility text-mono\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";

  it("@utility text-mono 블록이 있다", () => {
    expect(block).not.toBe("");
  });

  it("font-family·font-size·line-height 셋을 함께 싣는다", () => {
    expect(block).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(block).toMatch(/font-size:\s*var\(--mono-size\)/);
    expect(block).toMatch(/line-height:\s*var\(--mono-leading\)/);
  });

  it("font-size 토큰 경로(--text-mono)는 없다 — 소비 경로가 둘이면 하나만 놓쳐도 갈린다", () => {
    expect(CSS).not.toMatch(/^\s*--text-mono/m);
  });

  it("`dark:` 차단 장치가 그대로다 — 다크는 토큰 값이 든다", () => {
    expect(CSS).toContain("@custom-variant dark (&:is(.dark *));");
  });
});

/**
 * **포커스 링이 border와 같은 값이면 보이지 않는다** (2026-09-11 사용자 — 블루 계열로 전환).
 *
 * 그때까지 `--ring`이 `--border`(`hsl(0 0% 89.8%)`)와 **같은 값**이라 흰 배경에서 대비가 1.19:1이었다 —
 * 프리미티브 여덟이 `ring-ring`을 정확히 들고 `focus-ring.test.ts`가 그것을 전수로 세는 동안,
 * **링은 green이면서 눈에 안 보였다.** DESIGN §7이 그 사실을 "약하다"로 적고 호출부가
 * `ring-offset-1`로 덧대는 우회를 들고 있었는데, 고칠 자리는 토큰 하나였다.
 *
 * ⚠️ 그래서 여기서 세는 것은 **값이 무엇인가가 아니라 border와 다른가**다 — 색을 고르는 것은
 * DESIGN의 일이고, 되돌아가면 안 되는 것은 "같아지는 것"이다.
 */
describe("globals.css — 포커스 링", () => {
  const tokenOf = (name: string): string => new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m").exec(CSS)?.[1]?.trim() ?? "";

  it("--ring이 --border와 다르다 — 같으면 링이 green인 채로 안 보인다", () => {
    expect(tokenOf("ring")).not.toBe("");
    expect(tokenOf("border")).not.toBe("");
    expect(tokenOf("ring")).not.toBe(tokenOf("border"));
  });

  /** 무채색으로 되돌아가면 같은 결함이 값만 바꿔 돌아온다 — 파랑 성분이 실재하는지 본다. */
  it("무채색이 아니다", () => {
    const ring = tokenOf("ring");
    const hsl = /hsl\(\s*([\d.]+)\s+([\d.]+)%/.exec(ring);
    const rgb = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/.exec(ring);
    if (hsl) {
      // saturation 0이면 회색이다 — hue는 그때 의미가 없다.
      expect(Number(hsl[2])).toBeGreaterThan(0);
    } else if (rgb) {
      const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
      expect(b).toBeGreaterThan(Math.max(r, g));
    } else {
      throw new Error(`--ring 형식을 못 읽었다: ${ring}`);
    }
  });
});

/**
 * **`:root`에 변수만 만들고 `@theme inline` 등록을 빠뜨리면 클래스가 아예 생성되지 않는다.**
 *
 * ⚠️ 8-1b가 그렇게 나갔다 — `bg-auth-canvas`·`from-auth-hero-from`이 **존재하지 않는 유틸**이라
 * 조용히 무시됐고, 배경색·그라데이션·border 셋이 한꺼번에 사라졌다. 오류도 경고도 없다.
 *
 * 그래서 **양방향으로 센다**: 등록된 것이 실재하는가 + `:root`의 색 변수가 전부 등록됐는가.
 */
describe("globals.css — 토큰 등록", () => {
  const theme = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";

  it("남은 custom 색마다 실제 생산 클래스 또는 직접 변수 소비자가 있다", () => {
    const sources = ["app", "components", "lib", "messages", "public"]
      .flatMap((dir) => productionFiles(join(SOURCE_ROOT, dir)))
      .map((path) => ({ path: relative(SOURCE_ROOT, path), source: readFileSync(path, "utf8") }));
    expect(sources.length).toBeGreaterThan(100);
    const colors = [...theme.matchAll(/^\s*--color-([\w-]+):\s*var\((--[\w-]+)\)/gm)];
    expect(colors.length).toBeGreaterThan(15);
    const unused = colors.filter((m) => !sources.some(({ source }) => colorUses(source, m[1]!, m[2]!).length > 0)).map((m) => m[1]);
    expect(unused).toEqual([]);
    // 이 색은 @theme를 못 쓰는 Canvas의 실제 getPropertyValue 소비자다.
    expect(sources.filter(({ source }) => colorUses(source, "signin-dot", "--signin-dot").length > 0).map(({ path }) => path))
      .toContain("components/signin/dot-field.tsx");
  });

  it("승인된 미사용 색 일곱의 등록과 루트 짝이 없다", () => {
    for (const name of ["card", "card-foreground", "popover-foreground", "secondary", "secondary-foreground", "accent-foreground", "destructive-foreground"]) {
      expect(theme, name).not.toMatch(new RegExp(`--color-${name}:`));
      expect(root, name).not.toMatch(new RegExp(`--${name}:`));
    }
  });

  it("수정자·별도 속성·직접 참조는 세되 자체 등록·주석·다른 토큰은 세지 않는다 (카나리아)", () => {
    for (const property of ["bg", "text", "border-t", "ring", "from", "to", "placeholder", "caret", "accent"]) {
      expect(colorUses(`hover:${property}-probe/[0.5]`, "probe", "--probe")).toHaveLength(1);
    }
    expect(colorUses('color:var(--probe); getPropertyValue("--color-probe")', "probe", "--probe")).toHaveLength(2);
    expect(colorUses('@theme inline { --color-probe: var(--probe); } :root { --probe: #ffffff; } /* text-probe */ text-probe-other', "probe", "--probe")).toEqual([]);
  });

  it("두 블록을 찾았다 — 정규식이 조용히 빈 문자열이 되지 않는다", () => {
    expect(theme).not.toBe("");
    expect(root).not.toBe("");
  });

  /**
   * 등록에서 값을 안 가리키면 유틸은 생기지만 **색이 없다** — 위와 증상이 다르고 원인이 같다.
   */
  it("`@theme`의 `--color-*`가 앱 루트 또는 Tailwind 기본 테마의 실재 변수를 가리킨다", () => {
    const require = createRequire(import.meta.url);
    const defaults = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");
    const rootNames = new Set([...root.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    for (const match of defaults.matchAll(/^\s*(--[\w-]+):/gm)) rootNames.add(match[1]);
    const dangling = [...theme.matchAll(/^\s*(--color-[\w-]+):\s*var\((--[\w-]+)\)/gm)]
      .filter((m) => !rootNames.has(m[2] ?? ""))
      .map((m) => m[1]);
    expect(dangling).toEqual([]);
  });

  /**
   * ⚠️ **등록하지 않는 변수는 이름으로 고정한다.** 넷 다 유틸 클래스의 재료가 아니다 —
   * `--radius`는 `--radius-*`의 `calc()` 입력, mono 둘은 `@utility text-mono`가 직접 읽고,
   * `--signin-dot`은 Canvas가 `getComputedStyle`로 읽는다(유틸을 못 받는다).
   * 목록에 이름을 더하려면 **그 변수를 클래스로 안 쓰는 이유**가 함께 있어야 한다.
   */
  it("`:root`의 색 변수가 전부 등록됐다 — 안 하면 클래스가 생성되지 않는다", () => {
    // `--shadow-color`는 `@theme`의 `--shadow-low/medium`이 `color-mix`로 읽는 재료다 — 클래스로 쓰지 않는다(color-scheme design §2.2).
    const UNREGISTERED = new Set(["--radius", "--mono-size", "--mono-leading", "--signin-dot", "--shadow-color"]);
    const registered = new Set(
      [...theme.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1] ?? ""),
    );
    const missing = [...root.matchAll(/^\s*(--[\w-]+):/gm)]
      .map((m) => m[1] ?? "")
      .filter((name) => !UNREGISTERED.has(name) && !registered.has(name));
    expect(missing).toEqual([]);
  });

  /**
   * ⚠️ **8-2가 `--auth-canvas`를 `--canvas`로 옮겼다** — 셸의 페이지 배경이 같은 값이라, 이름에
   * `auth`가 남으면 앱 셸이 "auth" 토큰을 쓰게 되고 값의 집이 둘로 갈릴 압력이 생긴다.
   */
  it("캔버스 토큰의 이름이 화면에 매이지 않는다", () => {
    expect(root).toMatch(/^\s*--canvas:/m);
    expect(CSS).not.toContain("--auth-canvas");
  });
});

/** `light-dark(a, b)`면 [a, b], 아니면 두 테마 같은 값 [v, v]. 최상위 쉼표로만 가른다(`color-mix(…, transparent)`의 쉼표는 안쪽이다). */
function themes(value: string | undefined): [string, string] | null {
  if (value === undefined) return null;
  const body = /^light-dark\(([\s\S]*)\)$/.exec(value)?.[1];
  if (body === undefined) return [value, value];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return [body.slice(0, i).trim(), body.slice(i + 1).trim()];
  }
  throw new Error(`light-dark()에 인자가 둘이 아니다: ${value}`);
}

/** 의미 색 34의 라이트 값 — 옮겨 온 raw(design §2.2). 아래 두 describe가 같이 쓴다. */
const LIGHT: Readonly<Record<string, string>> = {
  "--link": "var(--color-blue-600)",
  "--gray-light": "var(--color-neutral-300)",
  "--gray-dim": "var(--color-neutral-400)",
  "--gray-strong": "var(--color-neutral-600)",
  "--success-surface": "var(--color-green-50)",
  "--success-soft": "color-mix(in oklab, var(--color-green-100) 80%, transparent)",
  "--success-foreground": "var(--color-green-800)",
  "--warning-surface": "var(--color-amber-50)",
  "--warning-soft": "color-mix(in oklab, var(--color-amber-100) 80%, transparent)",
  "--warning-soft-foreground": "var(--color-amber-800)",
  "--warning-foreground": "var(--color-amber-700)",
  "--warning-emphasis": "var(--color-amber-500)",
  "--danger-surface": "var(--color-red-50)",
  "--info-surface": "var(--color-blue-50)",
  "--hue-rose": "var(--color-rose-600)",
  "--hue-orange": "var(--color-orange-600)",
  "--hue-amber": "var(--color-amber-600)",
  "--hue-emerald": "var(--color-emerald-600)",
  "--hue-teal": "var(--color-teal-600)",
  "--hue-sky": "var(--color-sky-600)",
  "--hue-indigo": "var(--color-indigo-600)",
  "--hue-fuchsia": "var(--color-fuchsia-600)",
  "--on-hue": "var(--color-white)",
  // 오버레이는 `--foreground`의 라이트 값과 같은 색이되 그 변수를 가리키지 않는다(다크에서 갈린다).
  "--scrim": "hsl(0 0% 3.9%)",
  "--shadow-color": "rgb(22 24 27)",
  "--diff-removed": "var(--color-red-700)",
  "--diff-added": "var(--color-green-800)",
  "--kind-blue-surface": "var(--color-blue-50)",
  "--kind-blue": "var(--color-blue-700)",
  "--kind-teal-surface": "var(--color-teal-50)",
  "--kind-teal": "var(--color-teal-700)",
  "--kind-violet-surface": "var(--color-violet-50)",
  "--kind-violet": "var(--color-violet-700)",
  "--surface-subtle": "var(--color-neutral-50)",
};

/**
 * **의미 색의 라이트 값은 옮겨 온 raw 그대로다** (color-scheme Phase 1 — spec 완료 조건 3·4, design §2.2).
 *
 * ⚠️ 이 표가 지키는 것은 **토큰 값**뿐이다 — `amber-700` 자리에 `warning-soft-foreground`(amber-800)를 붙인 자리별 오매핑은
 * 못 잡는다(그것은 이관 전 computed style 표본과의 수동 대조 몫이다). Phase 2에서 `light-dark()`가 감싸도 첫 인자가 이 값이어야 한다.
 */
describe("globals.css — 의미 색 토큰", () => {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const theme = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const declared = new Map([...root.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2]?.trim()]));


  it.each(Object.entries(LIGHT))("%s의 라이트 값이 옮겨 온 raw와 같다", (name, value) => {
    expect(themes(declared.get(name))?.[0]).toBe(value);
  });

  it("오버레이 토큰이 `--foreground`의 라이트 값과 같은 색이다 — 다크에서는 갈린다(덮개는 계속 어둡다)", () => {
    expect(themes(declared.get("--scrim"))?.[0]).toBe(themes(declared.get("--foreground"))?.[0]);
    expect(themes(declared.get("--scrim"))?.[1]).not.toBe(themes(declared.get("--foreground"))?.[1]);
  });

  it("`@theme inline`이 팔레트를 별칭으로 들지 않는다 — 모든 색 유틸의 값은 `:root`에서 온다", () => {
    expect(theme).not.toBe("");
    expect([...theme.matchAll(/^\s*(--color-[\w-]+):\s*(.+);/gm)].filter((m) => /var\(--color-/.test(m[2] ?? "")).map((m) => m[1])).toEqual([]);
  });

  it("그림자 둘의 색이 `--shadow-color`를 지난다 — 리터럴 색이 `@theme`에 남지 않는다", () => {
    for (const name of ["--shadow-low", "--shadow-medium"]) {
      const value = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(theme)?.[1] ?? "";
      expect(value, name).toMatch(/color-mix\(in srgb, var\(--shadow-color\) \d+%, transparent\)/);
      expect(value, name).not.toMatch(/rgb\(|hsl\(|#[0-9a-f]{3,8}/i);
    }
    expect(theme).toMatch(/--shadow-low:[^;]*var\(--shadow-color\) 5%/);
    expect(theme).toMatch(/--shadow-medium:[^;]*var\(--shadow-color\) 15%/);
  });
});

/**
 * **다크 값은 시안 핸드오프 README §5 표 그대로다** (color-scheme Phase 2 — design §3.8). 표기는 Tailwind 이름 또는 hex, `@N%`는
 * `color-mix(in oklab, … N%, transparent)`. 값을 바꾸는 것은 시안의 일이다 — 여기서 고치면 대비 검사(`lib/color-scheme/__tests__/contrast.test.ts`)도 같이 본다.
 *
 * ⚠️ **색 변수 하나가 `light-dark()` 한 줄이다** — `[data-theme=dark]`·System 미디어 블록에 두 벌 적으면 한 벌만 고쳐 명시 다크와 System 다크가 조용히 갈린다.
 * 두 테마 같은 값은 감싸지 않고 `THEME_INVARIANT`에 이유와 함께 둔다.
 */
describe("globals.css — 다크 값 (light-dark)", () => {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const declared = new Map([...root.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.replace(/\s+/g, " ").trim()]));
  const NOT_COLOR = new Set(["--radius", "--mono-size", "--mono-leading"]);
  const p = (name: string) => `var(--color-${name})`;
  const a = (name: string, percent: number) => `color-mix(in oklab, var(--color-${name}) ${percent}%, transparent)`;

  /** 다크에서도 같은 값 — 이유가 없으면 이 목록에 더하지 않는다. */
  const THEME_INVARIANT: Readonly<Record<string, string>> = {
    "--hue-rose": "식별색 — 같은 사람·프로젝트는 테마와 무관하게 같은 색(시안 §5.2 · DESIGN §2)",
    "--hue-orange": "식별색",
    "--hue-amber": "식별색",
    "--hue-emerald": "식별색",
    "--hue-teal": "식별색",
    "--hue-sky": "식별색",
    "--hue-indigo": "식별색",
    "--hue-fuchsia": "식별색",
    "--on-hue": "식별색 위 흰 글자 — 면이 그대로라 글자도 그대로",
    "--warning-emphasis": "시안 §5.2 '그대로' — 호박 막대·대기 테두리는 두 테마 같은 값",
  };

  const DARK: Readonly<Record<string, string>> = {
    "--background": p("neutral-900"),
    "--foreground": p("neutral-100"),
    "--popover": "#1f1f1f",
    "--primary": p("neutral-100"),
    "--primary-foreground": "#1f1f1f",
    "--muted": p("neutral-800"),
    "--accent": p("neutral-800"),
    "--muted-foreground": p("neutral-400"),
    "--destructive": p("red-400"),
    "--border": p("neutral-800"),
    "--border-subtle": "#1f1f1f",
    "--divider": "#1e1e1e",
    "--input": "#3a3a3a",
    "--ring": p("blue-500"),
    "--signin-dot": p("blue-400"),
    "--canvas": p("neutral-950"),
    "--auth-hero-from": p("neutral-950"),
    "--auth-hero-to": p("blue-950"),
    "--link": p("blue-400"),
    "--gray-light": p("neutral-700"),
    "--gray-dim": p("neutral-500"),
    "--gray-strong": p("neutral-300"),
    "--success-surface": a("green-500", 10),
    "--success-soft": a("green-500", 16),
    "--success-foreground": p("green-400"),
    "--warning-surface": a("amber-500", 10),
    "--warning-soft": a("amber-500", 16),
    "--warning-soft-foreground": p("amber-300"),
    "--warning-foreground": p("amber-400"),
    "--danger-surface": a("red-500", 12),
    "--info-surface": a("blue-500", 12),
    "--diff-removed": p("red-400"),
    "--diff-added": p("green-400"),
    "--kind-blue-surface": a("blue-500", 14),
    "--kind-blue": p("blue-300"),
    "--kind-teal-surface": a("teal-500", 14),
    "--kind-teal": p("teal-300"),
    "--kind-violet-surface": a("violet-500", 16),
    "--kind-violet": p("violet-300"),
    // 시안·핸드오프의 `subtle` = 코드 `surface-subtle`(background보다 한 단계 어둡게 — design §3.8).
    "--surface-subtle": "#121212",
    "--shadow-color": p("black"),
    // 덮개는 다크에서도 어둡게 덮는다 — 시안 §5.2 `black`(#187: 라이트 값을 그대로 두면 다크가 `#0a0a0a`였다).
    "--scrim": p("black"),
  };

  const colors = [...declared.keys()].filter((name) => !NOT_COLOR.has(name));

  /**
   * **기본 토큰의 라이트 값** — `LIGHT`(의미 색 34) 밖의 색 변수다. Phase 2가 `light-dark()`로 감싸는 동안 라이트 쪽이 조용히 바뀌지 않게
   * base `7db35fec`(감싸기 직전)의 값을 문자열로 고정한다(color-scheme RC 🟡2). 라이트 값을 바꾸는 것은 시안·DESIGN의 일이다.
   */
  const LIGHT_BASE: Readonly<Record<string, string>> = {
    "--background": "hsl(0 0% 100%)",
    "--foreground": "hsl(0 0% 3.9%)",
    "--popover": "hsl(0 0% 100%)",
    "--primary": "hsl(0 0% 9%)",
    "--primary-foreground": "hsl(0 0% 98%)",
    "--muted": "hsl(0 0% 96.1%)",
    "--accent": "hsl(0 0% 96.1%)",
    "--muted-foreground": "hsl(0 0% 45.1%)",
    "--destructive": "hsl(0 72.2% 50.6%)",
    "--border": "hsl(0 0% 89.8%)",
    "--border-subtle": "rgb(233 236 239)",
    "--divider": "rgb(240 240 240)",
    "--input": "hsl(0 0% 89.8%)",
    "--ring": "rgb(96 165 250)",
    "--signin-dot": "rgb(37 99 235)",
    "--canvas": "rgb(245 246 247)",
    "--auth-hero-from": "rgb(245 246 247)",
    "--auth-hero-to": "rgb(215 227 254)",
  };

  it.each(Object.entries(LIGHT_BASE))("%s의 라이트 값이 Phase 2 전과 같다", (name, value) => {
    expect(themes(declared.get(name))?.[0]).toBe(value);
  });

  it("색 변수마다 라이트 값 표(`LIGHT` 또는 `LIGHT_BASE`) 하나에 든다 — 테마 불변도 `LIGHT`에 있다", () => {
    const lightTables = [...Object.keys(LIGHT), ...Object.keys(LIGHT_BASE)];
    expect(new Set(lightTables).size).toBe(lightTables.length);
    expect(Object.keys(THEME_INVARIANT).filter((name) => !Object.hasOwn(LIGHT, name))).toEqual([]);
    expect([...colors].sort()).toEqual(lightTables.sort());
  });

  it("본문 `:root`를 읽었다 — 정규식이 조용히 빈 표가 되지 않는다", () => {
    expect(colors.length).toBeGreaterThan(50);
  });

  it("색 변수는 전부 `light-dark()`이거나 테마 불변 목록에 있다 — 둘 다는 아니다", () => {
    const wrapped = colors.filter((name) => declared.get(name)!.startsWith("light-dark("));
    expect(colors.filter((name) => !wrapped.includes(name)).sort()).toEqual(Object.keys(THEME_INVARIANT).sort());
    expect(wrapped.sort()).toEqual(Object.keys(DARK).sort());
  });

  it.each(Object.entries(DARK))("%s의 다크 값이 시안과 같다", (name, value) => {
    expect(themes(declared.get(name))?.[1]).toBe(value);
  });

  it("`light-dark()`는 본문 `:root` 밖에 없다 — 테마 값의 집이 한 곳이다", () => {
    expect(consumingSource(CSS).match(/light-dark\(/g) ?? []).toEqual([]);
  });

  /**
   * ⚠️ **`color-scheme` 세 블록은 본문 `:root {` 뒤에 선다** (design §3.1) — 이 파일의 정규식과 대비 헬퍼가 **첫** `:root {`를 본문으로 잡는다.
   * 서버가 `<html data-theme>`을 싣고 System은 `light dark`라 OS 변경을 CSS만으로 따라간다.
   */
  it("`color-scheme`이 `data-theme` 셋으로 갈리고 본문 뒤에 선다", () => {
    const bodyEnd = CSS.indexOf(root) + root.length;
    const blocks = [...CSS.matchAll(/(:root(?:\[data-theme="(\w+)"\])?)\s*\{\s*color-scheme:\s*([^;]+);\s*\}/g)];
    expect(blocks.map((m) => [m[2] ?? "(default)", m[3]])).toEqual([["(default)", "light"], ["dark", "dark"], ["system", "light dark"]]);
    for (const m of blocks) expect(m.index).toBeGreaterThan(bodyEnd);
    expect(CSS.match(/color-scheme:/g)).toHaveLength(3);
  });
});

/**
 * **본문이 grayscale 안티앨리어싱으로 그려진다** (2026-09-25 사용자 — 보관 행의 회색 이름·배지가 굵어 보였다).
 * 명시가 없으면 macOS 브라우저의 기본 렌더링이 획을 두껍게 그려, 같은 500이 밝은 회색에서 한 단계 무겁게 읽힌다.
 */
describe("globals.css — 글꼴 렌더링", () => {
  const body = /\bbody\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";

  it("body가 antialiased를 든다", () => {
    expect(body).not.toBe("");
    expect(body).toMatch(/@apply[^;]*\bantialiased\b/);
  });
});

/**
 * **누를 수 있는 버튼은 손가락 커서다** (2026-09-25 사용자 — 번역 키 행·필터 칩에서 화살표였다).
 * Tailwind v4 preflight가 `button`의 커서를 `default`로 되돌려서, `Button` 밖의 raw 버튼(`ListItemButton`·Radix 트리거)은
 * 저마다 `cursor-pointer`를 기억해야 했고 셋이 빠져 있었다. 전역 한 줄이 그 기억을 대신한다.
 */
describe("globals.css — 버튼 커서", () => {
  it("꺼지지 않은 button이 pointer다", () => {
    expect(CSS).toMatch(/button:not\(:disabled\):not\(\[aria-disabled="true"\]\)[^{]*\{\s*cursor:\s*pointer;?\s*\}/);
  });
});

/**
 * **한국어 줄바꿈** (ui-locales design §5.5 — F3). 기본 `word-break: normal`은 CJK를 음절 사이에서 끊는다. `<html lang="ko">`가 켜는 규칙이라
 * 선택자가 `:lang(ko)`여야 하고, 띄어쓰기 없는 긴 토큰이 넘치지 않게 `overflow-wrap: anywhere`가 짝이다.
 */
describe("globals.css — :lang(ko) 줄바꿈", () => {
  it("keep-all과 overflow-wrap: anywhere를 한 규칙에 든다", () => {
    const block = /:lang\(ko\)\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(block).toMatch(/word-break:\s*keep-all;/);
    expect(block).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it("규칙이 하나다 — 두 벌이면 한쪽이 낡는다", () => {
    expect(CSS.match(/:lang\(ko\)/g)).toHaveLength(1);
  });
});
