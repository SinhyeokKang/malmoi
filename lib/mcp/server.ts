import "server-only";

import { McpServer } from "@modelcontextprotocol/server";

import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";

import { toolCatalog } from "./catalog";
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
 * 이름·순서·annotations는 카탈로그가, 입력 스키마·실행은 `lib/mcp/tools/*`가 든다.
 * `subject`는 서버가 토큰에서 만든 주체다 — 도구 입력으로 주체를 받지 않는다.
 */
export function createMcpServer(subject: ApiTokenSubject, origin: string | null = null): McpServer {
  const server = new McpServer({ name: "Malmoi", version: "1" }, { capabilities: { tools: { listChanged: false } } });
  const implemented = new Map(TOOLS.map(tool => [tool.name, tool]));
  for (const tool of toolCatalog()) {
    const definition = implemented.get(tool.name);
    // 카탈로그와 구현이 어긋났다 — 설정 오류라 요청을 받기 전에 던진다(`tools/registry.test.ts`가 상시로 센다).
    if (definition === undefined) throw new Error(`MCP tool ${tool.name} has no implementation`);
    server.registerTool(tool.name, { description: toolDescription(tool.name), annotations: tool.annotations, inputSchema: definition.inputSchema },
      async (input: unknown) => executeTool(definition, () => ({ prisma: getPrisma(), subject, now: new Date(), origin }), input));
  }
  return server;
}

/** 설명은 사전이 든다(브랜드·한글 게이트가 본다). 카탈로그에 새 이름이 늘면 사전에도 늘려야 한다 — 없으면 서버가 서지 않는다. */
function toolDescription(name: string): string {
  const tools: Record<string, string> = m.mcp.tools;
  if (!Object.hasOwn(tools, name) || tools[name] === "") throw new Error(`MCP tool ${name} has no description`);
  return tools[name]!;
}
