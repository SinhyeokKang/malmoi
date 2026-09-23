import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **`recipients.ts`는 클라이언트 폼도 부른다** — 그 그래프에 패키지가 하나도 없어야 한다.
 *
 * 처음 구현은 `zod`(클라이언트 허용 목록 밖)와 `./plan` → `lib/auth/invitation` → `node:crypto`를 물었다.
 * `components/__tests__/client-graph.test.ts`는 `"use client"` 진입점에서만 출발하므로 **모달이 이 모듈을
 * import하는 날에야** red가 된다 — 그 전에 여기서 고정한다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function packagesReachedFrom(entry: string): string[] {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8").replace(/^import type [^;]+;$/gm, "");
    for (const match of source.matchAll(/^(?:import|export)[^;]*?from\s+"([^"]+)"|^import\s+"([^"]+)"/gm)) {
      const spec = match[1] ?? match[2] ?? "";
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        const next = resolveLocal(file, spec);
        if (next === null) packages.add(`unresolved:${spec}`);
        else stack.push(next);
      } else {
        packages.add(spec);
      }
    }
  }
  return [...packages].sort();
}

describe("recipients.ts — 클라이언트 번들에 들어가도 된다", () => {
  it("값 import 그래프에 패키지·node 내장 모듈이 없다", () => {
    expect(packagesReachedFrom(join(ROOT, "lib/invitation-email/recipients.ts"))).toEqual([]);
  });

  it("검사기 자신이 동작한다 — plan.ts에서는 node:crypto가 보인다", () => {
    expect(packagesReachedFrom(join(ROOT, "lib/invitation-email/plan.ts"))).toContain("node:crypto");
  });
});
