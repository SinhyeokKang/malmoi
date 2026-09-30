import { describe, expect, it } from "vitest";

import { connectionBrand } from "../brand";

/**
 * 브랜드 로고 (2026-09-30 사용자 — "확인된 출처만"). 연결 행의 로고는 **client_id 호스트**로만 고른다 — 이름(`client_name`)은 연결하는 쪽이 정하는
 * 값이라 아무나 "Claude Code"를 댈 수 있다. 등록이 CIMD뿐이라(`lib/oauth/metadata.ts`) client_id는 그 호스트가 문서를 내준 URL이다.
 */
describe("connectionBrand — 호스트 정확 일치만", () => {
  it.each([
    ["https://claude.ai/oauth/claude-code-client-metadata", "claude"],
    ["https://claude.ai/oauth/mcp-oauth-client-metadata", "claude"],
    ["https://chatgpt.com/oauth/codex/x/client.json", "openai"],
  ] as const)("%s → %s", (clientId, brand) => {
    expect(connectionBrand(clientId)).toBe(brand);
  });

  it.each([
    "https://evil.claude.ai/oauth/x",
    "https://claude.ai.evil.com/oauth/x",
    "https://chatgpt.com.evil.com/oauth/codex/x/client.json",
    "http://claude.ai/oauth/x",
    "https://cursor.com/oauth/x",
    "claude.ai",
    "Claude Code",
    "",
  ])("%s → 없음", (clientId) => {
    expect(connectionBrand(clientId)).toBeNull();
  });
});
