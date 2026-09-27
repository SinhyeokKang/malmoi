import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **`push:local`의 import 그래프는 Prisma 클라이언트에 닿지 않는다** (action-run-cache r2).
 *
 * 이 스크립트는 **대상 리포 러너에서** composite action이 clone한 말모이 트리 위에서 돈다 — 거기엔 `pnpm install`만 있고
 * `prisma generate`가 없다(`generated/`는 gitignore된 산출물이다). 2026-09-24에 `push-local.ts`가 `./local`의 `loadLocalEnv`를
 * 물면서 같은 파일의 `PrismaClient` import가 딸려 왔고, v2 스파이크의 모든 run이 `ERR_MODULE_NOT_FOUND …/generated/prisma/client`로
 * red였다. 로컬·CI는 `db:generate`가 먼저 돌아 green이라 **실행으로는 안 보인다** — 그래서 소스 그래프를 센다.
 *
 * ⚠️ action에 `prisma generate`를 넣어 푸는 길은 막는다 — 적재 스크립트가 DB 클라이언트를 요구할 이유가 없고 run이 느려진다.
 *
 * 검사 방식은 `components/__tests__/client-graph.test.ts`와 같다: 상대·`@/` 값 import를 따라가고(`import type`은 뺀다),
 * 동적 `import()`와 `export … from`도 간선이다.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENTRY = join(ROOT, "scripts", "push-local.ts");

/**
 * ⚠️ `server-only`도 막는다 — Next의 `react-server` 조건 밖(tsx)에서는 import만으로 던진다(`scripts/local.ts`가
 * `lib/db.ts`를 못 쓰는 이유와 같다, ARCHITECTURE §5.5.4). 러너의 `push:local`이 그 조건 없이 돈다.
 */
const FORBIDDEN = (specifier: string, resolved: string | undefined) =>
  specifier === "server-only" ||
  specifier.startsWith("@prisma/") ||
  specifier === "prisma" ||
  (resolved !== undefined && relative(ROOT, resolved).split(/[\\/]/)[0] === "generated");

/** 값 import의 specifier. `import type`·`export type`은 런타임에 없다. */
function specifiers(source: string): string[] {
  const out: string[] = [];
  const stat = /^\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm;
  const dynamic = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of source.matchAll(stat)) if (m[1] !== undefined) out.push(m[1]);
  for (const m of source.matchAll(dynamic)) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
    ? resolve(dirname(from), specifier)
    : undefined;
  if (base === undefined) return undefined;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // 파일이 없는 로컬 경로(`generated/` 같은 산출물) — 판정에는 경로 자체를 쓴다.
  return base;
}

function walk(): { visited: Set<string>; hits: string[] } {
  const visited = new Set<string>();
  const hits: string[] = [];
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    for (const specifier of specifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveLocal(file, specifier);
      if (FORBIDDEN(specifier, resolved)) {
        hits.push(`${relative(ROOT, file)} → ${specifier}`);
        continue;
      }
      if (resolved !== undefined && /\.tsx?$/.test(resolved) && existsSync(resolved)) queue.push(resolved);
    }
  }
  return { visited, hits };
}

describe("push:local import 그래프 — 대상 리포 러너에서 돈다", () => {
  const { visited, hits } = walk();

  it("전제: 그래프가 실제로 넓다 — 0에 가까우면 이 방어선은 장식이다", () => {
    expect(visited.size).toBeGreaterThan(20);
    expect([...visited].map((f) => relative(ROOT, f))).toContain("lib/push/payload.ts");
  });

  it("전제: 판정이 금지 대상을 실제로 집는다", () => {
    expect(FORBIDDEN("@prisma/adapter-pg", undefined)).toBe(true);
    expect(FORBIDDEN("server-only", undefined)).toBe(true);
    expect(FORBIDDEN("../generated/prisma/client", resolveLocal(join(ROOT, "scripts", "local.ts"), "../generated/prisma/client"))).toBe(true);
    expect(specifiers('import type { A } from "../x";\nimport { b } from "../y";\nexport { c } from "./z";')).toEqual(["../y", "./z"]);
  });

  it("`generated/prisma`·`@prisma/*`·`server-only`를 import하지 않는다 — 러너에 `prisma generate`도 react-server 조건도 없다", () => {
    expect(hits).toEqual([]);
  });
});
