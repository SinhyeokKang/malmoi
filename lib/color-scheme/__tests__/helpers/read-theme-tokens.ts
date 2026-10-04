import { parseColor, type Rgba } from "./oklch";

/** 최상위 쉼표로 가른다 — 함수 괄호 안의 쉼표는 건너뛴다. */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(body.slice(start).trim());
  return out;
}

/** `name(…)` 꼴이면 괄호 안을 돌려준다(값 전체가 그 함수 하나일 때만). */
function callBody(value: string, name: string): string | null {
  if (!value.startsWith(`${name}(`) || !value.endsWith(")")) return null;
  return value.slice(name.length + 1, -1);
}

/** 색으로 보이는 값만 — 반지름·글자 크기 같은 루트 변수는 대비 검사의 재료가 아니다. */
const COLORISH = /^(?:#|rgba?\(|hsla?\(|oklch\(|var\(|color-mix\(|light-dark\()/i;

type Side = "light" | "dark";

/**
 * `app/globals.css`의 **첫 `:root {` 블록**에서 색 변수를 두 테마 값으로 푼다(design §3.3).
 * - `light-dark(a, b)` → 라이트 a · 다크 b. 없으면 두 테마가 같은 값이다(Phase 2 전의 지금 파일도 읽힌다).
 * - `var(--color-…)` → Tailwind `theme.css`의 값 · `var(--<루트 변수>)` → 같은 블록의 그 변수(같은 테마 쪽).
 * - `color-mix(in oklab, X p%, transparent)` → X에 알파 p. ⚠️ 그 밖의 `color-mix`는 던진다 — 조용히 틀린 값을 내지 않는다.
 * ⚠️ 첫 `:root {`를 본문으로 잡는 것은 `globals-css.test.ts`와 같은 규칙이다 — `color-scheme` 한 줄 블록은 본문 뒤에 선다(design §3.1).
 */
export function readThemeTokens(css: string, tailwindTheme: string): { light: Record<string, Rgba>; dark: Record<string, Rgba> } {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1];
  if (root === undefined) throw new Error("readThemeTokens: :root block not found");
  const declarations = new Map<string, string>();
  for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) declarations.set(m[1]!, m[2]!.replace(/\s+/g, " ").trim());
  const palette = new Map<string, string>();
  for (const m of tailwindTheme.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) palette.set(m[1]!, m[2]!.trim());

  function resolve(value: string, side: Side, owner: string, seen: Set<string>): Rgba {
    const ld = callBody(value, "light-dark");
    if (ld !== null) {
      const parts = splitTopLevel(ld);
      if (parts.length !== 2) throw new Error(`readThemeTokens: ${owner} light-dark() needs two arguments`);
      return resolve(side === "light" ? parts[0]! : parts[1]!, side, owner, seen);
    }
    const ref = callBody(value, "var");
    if (ref !== null) {
      const name = ref.trim();
      if (seen.has(name)) throw new Error(`readThemeTokens: ${owner} has a cycle through ${name}`);
      const next = declarations.get(name) ?? palette.get(name);
      if (next === undefined) throw new Error(`readThemeTokens: ${owner} references unknown ${name}`);
      return resolve(next, side, owner, new Set([...seen, name]));
    }
    const mix = callBody(value, "color-mix");
    if (mix !== null) {
      const [space, first, second] = splitTopLevel(mix);
      const pick = /^(.*\S)\s+([\d.]+)%$/.exec(first ?? "");
      if (space !== "in oklab" || second !== "transparent" || !pick) throw new Error(`readThemeTokens: ${owner} unsupported color-mix(${mix})`);
      const base = resolve(pick[1]!, side, owner, seen);
      return { ...base, a: base.a * (Number.parseFloat(pick[2]!) / 100) };
    }
    const color = parseColor(value);
    if (color === null) throw new Error(`readThemeTokens: ${owner} has an unreadable color ${value}`);
    return color;
  }

  const light: Record<string, Rgba> = Object.create(null);
  const dark: Record<string, Rgba> = Object.create(null);
  for (const [name, value] of declarations) {
    if (!COLORISH.test(value)) continue;
    light[name] = resolve(value, "light", name, new Set([name]));
    dark[name] = resolve(value, "dark", name, new Set([name]));
  }
  return { light, dark };
}
