import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **세션 인가 예외 route의 필수 가드 호출** (mcp-connector 검수 S). `entry-points.test.ts`는 예외 route를 `EXEMPT` 이름 집합에 넣을 뿐
 * **그 route가 자기 인증을 실제로 부르는지**는 세지 않는다 — 예외에 든 순간 가드를 지워도 green이다. 여기가 route마다 "이 호출이
 * 있어야 한다"를 센다.
 * ⚠️ **호출(`g(`)을 센다, 이름이 아니라** (POSTMORTEM 2026-09-18) — import 줄·주석이 이름을 들고 있어 호출을 지운 route가 green이었다.
 */

const APP = fileURLToPath(new URL("..", import.meta.url));

/** `app/` 기준 경로 → 주석을 벗긴 소스에 있어야 하는 호출. 새 예외 route가 자기 인증을 가지면 여기에 함께 적는다. */
const REQUIRED_GUARD: Record<string, readonly string[]> = {
  // 개인 MCP 토큰 — 세션이 없는 진입점이라 Bearer 해시 조회가 인가의 입구다(design §1.2).
  "api/mcp/route.ts": ["resolveApiToken"],
};

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function missingGuards(source: string, guards: readonly string[]): string[] {
  const code = stripComments(source);
  return guards.filter(g => !new RegExp(`\\b${g}\\(`).test(code));
}

describe("가드 호출 판정", () => {
  it("호출이 있으면 통과", () => {
    expect(missingGuards("const s = await resolveApiToken(prisma, t, now);", ["resolveApiToken"])).toEqual([]);
  });

  it("import·주석 인용만 있으면 빠진 것이다", () => {
    const src = 'import { resolveApiToken } from "@/lib/mcp/token-store";\n// resolveApiToken()을 지난다\n/** resolveApiToken( */';
    expect(missingGuards(src, ["resolveApiToken"])).toEqual(["resolveApiToken"]);
  });

  it("비슷한 이름은 호출이 아니다", () => {
    expect(missingGuards("await resolveApiTokenLater(x);", ["resolveApiToken"])).toEqual(["resolveApiToken"]);
  });
});

describe("예외 route → 필수 가드", () => {
  it.each(Object.entries(REQUIRED_GUARD))("%s가 %s를 부른다", (path, guards) => {
    const source = readFileSync(`${APP}/${path}`, "utf8");
    expect(missingGuards(source, guards)).toEqual([]);
  });
});
