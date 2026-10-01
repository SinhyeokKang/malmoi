import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 순수 모듈에는 `server-only`를 붙이지 않는다 (mcp-connector design §3 — 경계는 파일 단위다). 테스트가 직접 import한다(`catalog.ts`는 잎이라 순수 판정도
 * 바로 읽는다). `route.ts`·`tools/*`·`token-store.ts`만 붙인다.
 */

const ROOT = join(__dirname, "..", "..", "..");
const PURE = ["lib/mcp/token.ts", "lib/mcp/grant.ts", "lib/mcp/issue-plan.ts", "lib/mcp/batch.ts", "lib/mcp/result.ts", "lib/mcp/catalog.ts",
  "lib/mcp/http.ts", "lib/mcp/confirm.ts", "lib/publish/fingerprint.ts"];

describe("mcp 순수 모듈 경계", () => {
  it.each(PURE)("%s에 server-only가 없다", path => {
    expect(readFileSync(join(ROOT, path), "utf8")).not.toMatch(/import\s+["']server-only["']/);
  });
});
