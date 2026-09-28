import "server-only";

import { listProjects, whoami } from "./account";
import type { ToolDefinition } from "./define";
import { getKey, listKeys, previewRevertTool } from "./keys";
import { getProject, getWorkflow, listEvents, listMembers } from "./project";
import { detectFormatsTool, listBranches, listRepositoriesTool } from "./repos";
import { previewSync } from "./sync";

/**
 * 구현된 도구 — 이름이 `toolCatalog()`의 이름과 같아야 한다(`lib/mcp/__tests__/tools-registry.test.ts`). 순서·annotations는 카탈로그가
 * 정본이고 여기는 이름 → 구현 대응만 든다.
 */
export const TOOLS: readonly ToolDefinition[] = [
  whoami, listProjects, getProject, listRepositoriesTool, listBranches, detectFormatsTool,
  listKeys, getKey, previewSync, previewRevertTool, listEvents, getWorkflow, listMembers,
];
