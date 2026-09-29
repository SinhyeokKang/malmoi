/**
 * `/mcp` Connect 카드의 설정 조각 (핸드오프 §4 · design §1.1 실측). **토큰 원문을 넣을 자리가 없다** — 셋 다 환경변수 참조다
 * (POSTMORTEM 2026-09-04 — 설정 파일에 비밀값을 박으면 트랜스크립트·리포로 샌다).
 *
 * 경로는 **기존 파일에 항목을 덧붙이는** 곳이라 라벨 동사가 `Add to`다. ⚠️ Claude Code는 프로젝트 범위 `.mcp.json`이다 —
 * `~/.claude.json`은 전체 사용자 상태 파일이라 이 조각으로 저장하면 기존 설정이 덮인다(핸드오프 §4).
 * 형식의 근거: Claude Code `headers` + `${VAR}`와 Codex `bearer_token_env_var`는 T1에서 실제로 붙여 봤다. Cursor의 `${env:VAR}`는
 * Cursor 문서의 치환 문법이고 실측하지 않았다(QA 목록).
 *
 * ⚠️ **잎이다 — import가 0이다.** 클라이언트 컴포넌트가 값으로 읽는다.
 */

/** 개인 토큰 방식의 클라이언트 — 순서가 탭 순서다. */
export const CONNECT_CLIENTS = ["claude-code", "codex", "cursor"] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];

/**
 * 브라우저(OAuth) 방식의 클라이언트 (mcp-oauth 핸드오프 §7.4). claude.ai는 설정 파일이 아니라 웹 화면의 단계라 조각이 없다 — 카드가 단계를 그린다.
 * Cursor는 OAuth 실측 대상이 아니다(spec — 대상 셋 고정).
 */
export const BROWSER_CLIENTS = ["claude-code", "codex", "claude-ai"] as const;
export type BrowserClient = (typeof BROWSER_CLIENTS)[number];

export const CONNECT_METHODS = ["browser", "token"] as const;
export type ConnectMethod = (typeof CONNECT_METHODS)[number];

/** 사용자 셸에 둘 환경변수 이름 — 발급 결과 화면의 안내와 같은 이름이어야 한다. */
export const TOKEN_ENV = "MALMOI_TOKEN";
/** 설정 파일의 서버 키 — 에이전트 도구 이름의 접두(`mcp__malmoi__…`)가 된다. 식별자라 소문자다(brand-spelling 예외 한 자리). */
export const SERVER_KEY = "malmoi";

/**
 * ⚠️ **브라우저 방식은 서버 키 + URL만이다** — 헤더가 있으면 Claude Code는 OAuth로 넘어가지 않고 401 본문만 보인다(ARCHITECTURE §6.45.1 실측).
 * 두 방식을 한 조각에 섞지 않는다. 브라우저 방식에 조각이 있는 클라이언트는 둘(Claude Code · Codex)이다.
 */
export function connectSnippet(client: ConnectClient, url: string, method: ConnectMethod): { path: string; body: string } {
  if (method === "browser") {
    if (client === "codex") return { path: "~/.codex/config.toml", body: `[mcp_servers.${SERVER_KEY}]\nurl = ${JSON.stringify(url)}` };
    return { path: ".mcp.json", body: json({ mcpServers: { [SERVER_KEY]: { type: "http", url } } }) };
  }
  if (client === "codex") {
    return { path: "~/.codex/config.toml", body: `[mcp_servers.${SERVER_KEY}]\nurl = ${JSON.stringify(url)}\nbearer_token_env_var = "${TOKEN_ENV}"` };
  }
  if (client === "cursor") {
    return { path: ".cursor/mcp.json", body: json({ mcpServers: { [SERVER_KEY]: { url, headers: { Authorization: `Bearer \${env:${TOKEN_ENV}}` } } } }) };
  }
  return { path: ".mcp.json", body: json({ mcpServers: { [SERVER_KEY]: { type: "http", url, headers: { Authorization: `Bearer \${${TOKEN_ENV}}` } } } }) };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
