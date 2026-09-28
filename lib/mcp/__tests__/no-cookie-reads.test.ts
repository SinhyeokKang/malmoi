import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **MCP 경로는 쿠키를 읽지 않는다** (mcp-connector design §1.2). 그것이 CSRF 방어의 전부다 — 제3자 페이지는 Bearer를 붙일 수 없지만
 * 쿠키는 브라우저가 붙인다. 기존 `entry-points.test.ts`는 `await auth()`만 금지하므로 이 두 트리에 대해 셋을 따로 센다.
 * ⚠️ **호출을 센다, 이름이 아니라** (POSTMORTEM 2026-09-18) — 주석 속 인용은 호출이 아니다.
 */

const ROOT = join(__dirname, "..", "..", "..");
const TREES = ["lib/mcp", "app/api/mcp"];
const FORBIDDEN = [/\bauth\(/, /\breadSession\(/, /\bcookies\(/];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function readsCookies(source: string): boolean {
  const code = stripComments(source);
  return FORBIDDEN.some(re => re.test(code));
}

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("쿠키 읽기 스캐너", () => {
  it("세 호출을 잡는다", () => {
    expect(readsCookies("const s = await auth();")).toBe(true);
    expect(readsCookies("const s = await readSession();")).toBe(true);
    expect(readsCookies("const jar = await cookies();")).toBe(true);
  });

  it("import·주석 인용·비슷한 이름은 호출이 아니다", () => {
    expect(readsCookies('import { auth } from "@/auth";')).toBe(false);
    expect(readsCookies("// auth()를 부르지 않는다\n/* cookies() */")).toBe(false);
    expect(readsCookies("await oauth(); planApiTokenUse(); readSessionless(x);")).toBe(false);
  });
});

describe("lib/mcp/** · app/api/mcp/**", () => {
  const files = TREES.flatMap(tree => sources(join(ROOT, tree)));

  it("스캔 대상이 있다 — 0건이면 방어선이 아니라 장식이다", () => {
    expect(files.some(f => f.endsWith(join("app", "api", "mcp", "route.ts")))).toBe(true);
    expect(files.length).toBeGreaterThan(5);
  });

  it("auth( · readSession( · cookies( 호출이 0건", () => {
    const offenders = files.filter(f => readsCookies(readFileSync(f, "utf8"))).map(f => f.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
