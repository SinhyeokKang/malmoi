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
 * (`import type`은 지운다), 그 그래프에 금지된 패키지가 나타나면 red.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * 클라이언트에 들어가면 안 되는 것. **크기이자 경계다** — `ts-morph`는 TypeScript 컴파일러를,
 * `octokit`은 App 개인키를 쓰는 코드를, `@prisma/client`는 DB 드라이버를 끌어온다.
 */
const FORBIDDEN = ["ts-morph", "octokit", "@prisma/client", "node:fs", "server-only"];

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

/** `import type { … } from "x"`와 `import { type A } from "x"`의 타입 전용 지정자는 지운다 — 런타임에 없다. */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const m of source.matchAll(/^\s*import\s+([\s\S]*?)from\s*["']([^"']+)["']/gm)) {
    const clause = m[1] ?? "";
    const from = m[2] ?? "";
    if (/^\s*type\s/.test(clause)) continue;
    // `import { type A, type B } from "x"`도 값이 없다 — 중괄호 안이 전부 `type `이면 건너뛴다.
    const braces = /\{([\s\S]*)\}/.exec(clause);
    if (braces !== undefined && braces !== null && !/^\s*$/.test(braces[1] ?? "")) {
      const named = (braces[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
      const hasValue = named.some((s) => !s.startsWith("type "));
      const hasDefaultOrNamespace = /^[^{]*[A-Za-z_$]/.test(clause.split("{")[0] ?? "");
      if (!hasValue && !hasDefaultOrNamespace) continue;
    }
    specifiers.push(from);
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
  });

  it("서버 전용 무게가 클라이언트 그래프에 없다", () => {
    const { files, packages } = walk(CLIENT_ENTRIES);
    // Server Action(`"use server"`) 모듈은 클라이언트 참조 스텁으로 대체되므로 그 안쪽은 세지 않는다.
    const offenders = [...packages].filter((name) => FORBIDDEN.some((bad) => name === bad || name.startsWith(`${bad}/`)));
    expect({ offenders, reached: files.size }).toMatchObject({ offenders: [] });
  });
});
