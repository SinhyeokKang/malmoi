import "server-only";

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getPrisma } from "@/lib/db";

import { toolCatalog } from "./catalog";
import { toToolResult } from "./result";
import type { ApiTokenSubject } from "./token-store";
import { TOOLS } from "./tools";
import { executeTool } from "./tools/execute";

/**
 * 요청마다 새로 만드는 MCP 서버 (mcp-connector design §1.1). 두 개정(2026-07-28 · 2025 handshake)이 **같은 팩토리**를 지나므로
 * 도구 정의가 갈라지지 않는다. 도구는 `toolCatalog()` 순서로 등록한다 — SDK가 등록 순서를 그대로 `tools/list`로 낸다.
 *
 * ⚠️ **`tools.listChanged: false`** — 기본 true면 Claude Code가 `subscriptions/listen` SSE를 열고 응답이 끝나지 않는다(T1 실측).
 * Vercel 함수가 `maxDuration`까지 붙잡힌다. 도구 목록은 배포 사이에 안 바뀌므로 잃는 것이 없다.
 *
 * 구현(`lib/mcp/tools/*`)이 있는 도구는 그 입력 스키마·실행을, 아직 없는 이름은 `not-implemented`를 돌려준다(T7 전의 자리표시).
 * `subject`는 서버가 토큰에서 만든 주체다 — 도구 입력으로 주체를 받지 않는다.
 */
export function createMcpServer(subject: ApiTokenSubject): McpServer {
  const server = new McpServer({ name: "Malmoi", version: "1" }, { capabilities: { tools: { listChanged: false } } });
  const implemented = new Map(TOOLS.map(tool => [tool.name, tool]));
  for (const tool of toolCatalog()) {
    const definition = implemented.get(tool.name);
    if (definition === undefined) {
      server.registerTool(tool.name, { annotations: tool.annotations, inputSchema: z.looseObject({}) }, async () => toToolResult({ status: "not-implemented" }));
      continue;
    }
    server.registerTool(tool.name, { annotations: tool.annotations, inputSchema: definition.inputSchema },
      async (input: unknown) => executeTool(definition, () => ({ prisma: getPrisma(), subject, now: new Date() }), input));
  }
  return server;
}
