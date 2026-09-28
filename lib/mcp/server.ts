import "server-only";

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { toolCatalog } from "./catalog";
import { toToolResult } from "./result";
import type { ApiTokenSubject } from "./token-store";

/**
 * 요청마다 새로 만드는 MCP 서버 (mcp-connector design §1.1). 두 개정(2026-07-28 · 2025 handshake)이 **같은 팩토리**를 지나므로
 * 도구 정의가 갈라지지 않는다. 도구는 `toolCatalog()` 순서로 등록한다 — SDK가 등록 순서를 그대로 `tools/list`로 낸다.
 *
 * ⚠️ **`tools.listChanged: false`** — 기본 true면 Claude Code가 `subscriptions/listen` SSE를 열고 응답이 끝나지 않는다(T1 실측).
 * Vercel 함수가 `maxDuration`까지 붙잡힌다. 도구 목록은 배포 사이에 안 바뀌므로 잃는 것이 없다.
 *
 * 도구 구현(T6·T7, `lib/mcp/tools/*`)이 서기 전까지 모든 이름이 `not-implemented`를 돌려준다. 입력 스키마도 그때 도구가 가진다 —
 * 지금은 어떤 인자도 받아 넘긴다(`looseObject`). `subject`는 그 도구들이 받을 서버 주체다 — 도구 입력으로 주체를 받지 않는다.
 */
export function createMcpServer(subject: ApiTokenSubject): McpServer {
  const server = new McpServer({ name: "Malmoi", version: "1" }, { capabilities: { tools: { listChanged: false } } });
  for (const tool of toolCatalog()) {
    server.registerTool(
      tool.name,
      { annotations: tool.annotations, inputSchema: z.looseObject({}) },
      async () => toToolResult({ status: "not-implemented" }),
    );
  }
  return server;
}
