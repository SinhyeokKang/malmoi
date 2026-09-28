import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONNECT_CLIENTS, connectSnippet } from "../snippets";

/**
 * 연결 조각 (핸드오프 §4 · design §1.1 실측). **토큰 원문이 조각에 들어갈 자리가 없다** — 환경변수 참조뿐이다(POSTMORTEM 2026-09-04).
 * 경로는 기존 파일에 **덧붙이는** 곳이다 — Claude Code는 프로젝트 `.mcp.json`(`~/.claude.json`은 전체 사용자 상태 파일이라 덮으면 안 된다).
 */

const URL = "https://mal-moi.com/api/mcp";

describe("connectSnippet", () => {
  it("클라이언트 셋 — 순서가 탭 순서다", () => {
    expect(CONNECT_CLIENTS).toEqual(["claude-code", "codex", "cursor"]);
  });

  it("Claude Code — .mcp.json · http · Bearer ${MALMOI_TOKEN} (T1 실측 형)", () => {
    const s = connectSnippet("claude-code", URL);
    expect(s.path).toBe(".mcp.json");
    expect(JSON.parse(s.body)).toEqual({ mcpServers: { malmoi: { type: "http", url: URL, headers: { Authorization: "Bearer ${MALMOI_TOKEN}" } } } });
  });

  it("Codex — ~/.codex/config.toml · bearer_token_env_var (T1 실측 형)", () => {
    const s = connectSnippet("codex", URL);
    expect(s.path).toBe("~/.codex/config.toml");
    expect(s.body).toBe(`[mcp_servers.malmoi]\nurl = "${URL}"\nbearer_token_env_var = "MALMOI_TOKEN"`);
  });

  it("Cursor — .cursor/mcp.json · ${env:MALMOI_TOKEN}", () => {
    const s = connectSnippet("cursor", URL);
    expect(s.path).toBe(".cursor/mcp.json");
    expect(JSON.parse(s.body)).toEqual({ mcpServers: { malmoi: { url: URL, headers: { Authorization: "Bearer ${env:MALMOI_TOKEN}" } } } });
  });

  it.each(CONNECT_CLIENTS)("%s — mlm_ 원문 모양이 없다, 환경변수 이름만 있다", client => {
    const s = connectSnippet(client, URL);
    expect(s.body).not.toMatch(/mlm_[A-Za-z0-9_-]/);
    expect(s.body).toContain("MALMOI_TOKEN");
  });

  it("잎 모듈이다 — /mcp 클라이언트가 읽는다", () => {
    const source = readFileSync(join(__dirname, "..", "snippets.ts"), "utf8");
    expect(source.split("\n").filter(l => /^import\s/.test(l) && !/^import type\s/.test(l))).toEqual([]);
  });
});
