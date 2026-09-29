import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BROWSER_CLIENTS, CONNECT_CLIENTS, connectSnippet } from "../snippets";

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
    const s = connectSnippet("claude-code", URL, "token");
    expect(s.path).toBe(".mcp.json");
    expect(JSON.parse(s.body)).toEqual({ mcpServers: { malmoi: { type: "http", url: URL, headers: { Authorization: "Bearer ${MALMOI_TOKEN}" } } } });
  });

  it("Codex — ~/.codex/config.toml · bearer_token_env_var (T1 실측 형)", () => {
    const s = connectSnippet("codex", URL, "token");
    expect(s.path).toBe("~/.codex/config.toml");
    expect(s.body).toBe(`[mcp_servers.malmoi]\nurl = "${URL}"\nbearer_token_env_var = "MALMOI_TOKEN"`);
  });

  it("Cursor — .cursor/mcp.json · ${env:MALMOI_TOKEN}", () => {
    const s = connectSnippet("cursor", URL, "token");
    expect(s.path).toBe(".cursor/mcp.json");
    expect(JSON.parse(s.body)).toEqual({ mcpServers: { malmoi: { url: URL, headers: { Authorization: "Bearer ${env:MALMOI_TOKEN}" } } } });
  });

  it.each(CONNECT_CLIENTS)("%s — mlm_ 원문 모양이 없다, 환경변수 이름만 있다", client => {
    const s = connectSnippet(client, URL, "token");
    expect(s.body).not.toMatch(/mlm_[A-Za-z0-9_-]/);
    expect(s.body).toContain("MALMOI_TOKEN");
  });

  /**
   * **브라우저 방식**(mcp-oauth 핸드오프 §7.4 · design §8 "시크릿이 트랜스크립트에 남았다"). 헤더가 있으면 Claude Code는 OAuth로 넘어가지 않는다
   * (ARCHITECTURE §6.45.1 실측) — 서버 키 + URL만이다. claude.ai는 조각이 아니라 단계라 목록에만 있다.
   */
  it("브라우저 방식 클라이언트 셋 — claude.ai가 Cursor 자리에 선다", () => {
    expect(BROWSER_CLIENTS).toEqual(["claude-code", "codex", "claude-ai"]);
  });

  it("브라우저 · Claude Code — .mcp.json · http · URL만 (헤더 없음)", () => {
    const s = connectSnippet("claude-code", URL, "browser");
    expect(s.path).toBe(".mcp.json");
    expect(JSON.parse(s.body)).toEqual({ mcpServers: { malmoi: { type: "http", url: URL } } });
  });

  it("브라우저 · Codex — config.toml · url 한 줄 (bearer_token_env_var 없음)", () => {
    const s = connectSnippet("codex", URL, "browser");
    expect(s.path).toBe("~/.codex/config.toml");
    expect(s.body).toBe(`[mcp_servers.malmoi]\nurl = "${URL}"`);
  });

  it.each(["claude-code", "codex"] as const)("브라우저 · %s — 비밀값 자리 자체가 없다", client => {
    const body = connectSnippet(client, URL, "browser").body;
    expect(body).not.toMatch(/MALMOI_TOKEN|Authorization|bearer/i);
  });

  it("잎 모듈이다 — /mcp 클라이언트가 읽는다", () => {
    const source = readFileSync(join(__dirname, "..", "snippets.ts"), "utf8");
    expect(source.split("\n").filter(l => /^import\s/.test(l) && !/^import type\s/.test(l))).toEqual([]);
  });
});
