import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **클라이언트 컴포넌트의 import 그래프가 서버 전용 무게를 끌어오지 않는다.**
 *
 * 2026-09-07에 실제로 밟았다: `components/translation-input.tsx`가 `lib/onboarding/message`를
 * 물었고 그 모듈이 `./slug` → `lib/pull/trigger` → `lib/pull/run` → `lib/adapters` → `ts-dict` →
 * **`ts-morph`(TypeScript 컴파일러 전체)** 로 이어져 **7.2MB 클라이언트 청크**가 세 페이지에 붙었다.
 *
 * ⚠️ **`pnpm build`가 통과한다.** 번들러는 그것을 오류로 보지 않고, `next build`의 라우트 표에도
 * 청크 크기가 안 나온다. 그때 내가 한 확인은 `@octokit`만 grep한 것이었고 — 그건 정말로 없었다 —
 * 그래서 "트리 셰이킹이 떼어낸다"는 잘못된 결론을 문서에 남겼다. **경계를 지키는 것은 grep 한 번이
 * 아니라 상시 검사다** (`credential-separation`·`entry-points`와 같은 계열).
 *
 * 검사 방식: `"use client"` 파일에서 시작해 `@/lib/**`·상대 경로를 **값 import만** 따라가고
 * (`import type`은 지운다), 그 그래프에 **허용 목록 밖의 패키지**가 나타나면 red.
 *
 * ⚠️ **금지 목록이 아니라 허용 목록이다** (2026-09-07 리뷰 🟡5). 전에는 다섯 개를 나열했는데 그건
 * 사고의 원인이었던 "자기가 고른 패턴만 답한다"와 같은 형태다 — `yaml`·`zod`처럼 목록에 없는
 * 무게는 통과했고, 목록에 있던 `server-only`조차 **이 리포가 쓰는 형태**(`import "server-only"`)를
 * 정규식이 못 봤다. 허용 목록은 새 의존성을 조용히 통과시키지 않는다.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * 클라이언트 번들에 들어와도 되는 패키지. **실측에서 나온 목록이다** — 늘리는 것은 의도된 결정이어야
 * 하고, 그 결정을 이 파일에서 한 번 하게 만드는 것이 요지다.
 *
 * `next/*`는 접두로 허용한다 — 프레임워크가 서브패스를 여러 개 쓰고(`next/link`·`next/navigation`)
 * 그것을 하나씩 등재하면 목록이 프레임워크 버전을 따라다닌다.
 */
const ALLOWED = ["react", "react-dom", "clsx", "tailwind-merge"];

function allowed(specifier: string): boolean {
  if (specifier === "next" || specifier.startsWith("next/")) return true;
  return ALLOWED.some((ok) => specifier === ok || specifier.startsWith(`${ok}/`));
}

/**
 * 과거에 실제로 새어 나갔거나 새면 곧바로 무거워지는 것들. **판정에 쓰지 않는다** — 아래 메타
 * 테스트가 "스캐너가 이것들을 실제로 집는지"를 확인하는 데만 쓴다(목록이 낡아도 판정은 안 좁아진다).
 */
const KNOWN_OFFENDERS = ["ts-morph", "octokit", "@prisma/client", "node:fs", "server-only", "yaml", "zod"];

const SKIP_DIR = new Set(["ui", "__tests__", "node_modules", "generated"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** `import type { … }`·`import { type A }`·`export type { … }`처럼 런타임에 남지 않는 절인가. */
function typeOnly(clause: string): boolean {
  if (/^\s*type\s/.test(clause)) return true;
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces === null || /^\s*$/.test(braces[1] ?? "")) return false;
  const named = (braces[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  const hasValue = named.some((s) => !s.startsWith("type "));
  const hasDefaultOrNamespace = /^[^{]*[A-Za-z_$]/.test(clause.split("{")[0] ?? "");
  return !hasValue && !hasDefaultOrNamespace;
}

/**
 * 그 파일에서 **런타임에 실제로 이어지는** 모듈 지정자 전부. 입구가 셋이라 셋을 다 본다:
 *
 * 1. `import … from "x"` — 기본형
 * 2. `import "x"` — **부수효과 전용.** `from`이 없어 1번 정규식에 안 걸린다. 이 리포에서
 *    `server-only`를 쓰는 **유일한 형태**라(`lib/db.ts`·`lib/auth/session.ts`), 못 보면 그 경계가
 *    원리적으로 검사되지 않는다 (2026-09-07 리뷰 🟡5).
 * 3. `export … from "y"` — **재수출도 값이 흐르는 길이다.** 배럴이 무거운 모듈을 재수출하면
 *    그 무게가 따라온다 — 7.2MB 사고가 트리 셰이킹에 기대면 안 된다는 것을 이미 보였다.
 */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const m of source.matchAll(/^\s*import\s+([\s\S]*?)from\s*["']([^"']+)["']/gm)) {
    if (!typeOnly(m[1] ?? "")) specifiers.push(m[2] ?? "");
  }
  for (const m of source.matchAll(/^\s*import\s*["']([^"']+)["']\s*;?\s*$/gm)) {
    specifiers.push(m[1] ?? "");
  }
  for (const m of source.matchAll(/^\s*export\s+((?:\*|\{[\s\S]*?\})\s*)from\s*["']([^"']+)["']/gm)) {
    if (!typeOnly(m[1] ?? "")) specifiers.push(m[2] ?? "");
  }
  return specifiers;
}

/** `@/lib/x` · `./y` → 실제 파일 경로. 패키지는 그대로 돌려준다(그 이름으로 판정한다). */
function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : join(from, "..", specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 다음 후보를 본다 — 없는 경로는 정상이다.
    }
  }
  return null;
}

/** 클라이언트 진입점에서 도달하는 파일 전부 + 마주친 패키지 이름. */
function walk(entries: string[]): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    /**
     * ⚠️ **`"use server"` 파일에서 멈춘다.** Next는 Server Action 모듈을 클라이언트 참조 스텁으로
     * 대체하므로 그 안쪽(prisma·octokit)은 번들에 들어오지 않는다 — 따라 들어가면 방어선이 항상
     * red가 되어 통째로 버려진다.
     */
    if (/^["']use server["']/.test(source.trimStart())) continue;
    for (const specifier of valueImports(source)) {
      const resolved = resolveModule(file, specifier);
      if (resolved === null) packages.add(specifier);
      else queue.push(resolved);
    }
  }
  return { files, packages };
}

const CLIENT_ENTRIES = [...sourceFiles(join(ROOT, "components")), ...sourceFiles(join(ROOT, "app"))].filter(
  (file) => /^["']use client["']/.test(readFileSync(file, "utf8").trimStart()),
);

describe("클라이언트 그래프", () => {
  it("`use client` 진입점을 실제로 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(CLIENT_ENTRIES.length).toBeGreaterThan(3);
  });

  it("`use server` 진입점 안쪽을 세지 않는다 — Action은 스텁으로 대체된다", () => {
    const actions = join(ROOT, "app/(edit)/projects/actions.ts");
    // 그 파일은 prisma·octokit을 문다. 클라이언트 컴포넌트가 그것을 import해도 번들에 오지 않는다.
    expect(walk([actions]).packages.size).toBe(0);
  });

  it("타입 전용 import는 그래프에 넣지 않는다 — 그것까지 세면 방어선이 항상 red다", () => {
    expect(valueImports('import type { A } from "x";')).toEqual([]);
    expect(valueImports('import { type A, type B } from "x";')).toEqual([]);
    expect(valueImports('import { a } from "x";')).toEqual(["x"]);
    expect(valueImports('import { type A, b } from "x";')).toEqual(["x"]);
    expect(valueImports('import x from "x";')).toEqual(["x"]);
    expect(valueImports('export type { A } from "x";')).toEqual([]);
  });

  /**
   * ⚠️ **입구를 하나씩 먹여 스캐너가 각각을 집는지 센다** (POSTMORTEM 2026-09-07 세 번째 항목의 관용구).
   * 이게 없으면 정규식이 좁아져도 통과가 보고되고, **좁은 검사는 자기 좁음을 신고할 수 없다.**
   */
  it("세 입구를 다 잡는다 — from 있는 import · 부수효과 import · 재수출", () => {
    // 이 리포가 `server-only`를 쓰는 유일한 형태다. 전 정규식은 이것을 통째로 못 봤다.
    expect(valueImports('import "server-only";')).toEqual(["server-only"]);
    expect(valueImports("import 'node:fs';")).toEqual(["node:fs"]);
    // 재수출: `lib/pull/trigger.ts`가 `./ref-slug`를 이 형태로 내보낸다.
    expect(valueImports('export { REF_SAFE_SLUG, isRefSafeSlug } from "./ref-slug";')).toEqual(["./ref-slug"]);
    expect(valueImports('export * from "ts-morph";')).toEqual(["ts-morph"]);
  });

  it("허용 판정이 실제로 가른다 — 목록 밖은 전부 걸린다", () => {
    for (const ok of ["react", "next/link", "next/navigation", "clsx", "tailwind-merge"]) {
      expect(allowed(ok), ok).toBe(true);
    }
    for (const bad of KNOWN_OFFENDERS) expect(allowed(bad), bad).toBe(false);
    // 목록에 없는 **아무** 패키지도 통과하지 못한다 — 그게 금지 목록과의 차이다.
    for (const bad of ["sonner", "@tanstack/react-virtual", "lodash"]) expect(allowed(bad), bad).toBe(false);
  });

  it("허용 목록 밖의 패키지가 클라이언트 그래프에 없다", () => {
    const { files, packages } = walk(CLIENT_ENTRIES);
    const offenders = [...packages].filter((name) => !allowed(name));
    expect({ offenders, reached: files.size }).toMatchObject({ offenders: [] });
    // 그래프를 실제로 걸었다 — 0건 통과를 성공으로 읽지 않는다.
    expect(files.size).toBeGreaterThan(10);
    expect(packages.size).toBeGreaterThan(0);
  });
});
