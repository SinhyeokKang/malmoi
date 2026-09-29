import "server-only";
import { logFailure } from "@/lib/github-connect/log";

import { toToolResult, type ToolResult } from "../result";
import type { ToolContext, ToolDefinition } from "./define";

/**
 * 도구 하나를 실행해 MCP 결과로 바꾼다. ⚠️ **던지면 SDK가 예외 문구를 도구 결과에 싣는다**(`createToolError(error.message)`) — 500 본문
 * 규칙(ARCHITECTURE §6.0)을 어긴다. 그래서 여기서 전부 잡아 장애로 접고 원인은 로그에만 남긴다. `APP_SIGNING_SECRET`이 빈 탐지(서명이
 * 던진다)도 이 갈래다 — 후보 없음·만료로 접지 않는다.
 */
export async function executeTool(definition: ToolDefinition, context: () => ToolContext, input: unknown): Promise<ToolResult> {
  try {
    // 문맥도 try 안에서 만든다 — DB 클라이언트 생성(설정 누락)이 던져도 같은 갈래다.
    const ctx = context();
    // 주체의 자격증명 종류가 `token-scope`의 다음 행동을 가른다(#149 — 재발급 vs 앱에서 다시 연결).
    return toToolResult(await definition.run(ctx, input as never), ctx.subject.credential?.kind);
  } catch (error) {
    logFailure(`mcp-tool-${definition.name}`, error);
    return toToolResult({ status: "unavailable" });
  }
}
