import "server-only";

import { listProjects, whoami } from "./account";
import type { ToolDefinition } from "./define";
import { getKey, listKeys, previewRevertTool } from "./keys";
import { changeMember, inviteMembersTool, revokeInvitation } from "./members";
import { addSourcesTool, createProject } from "./onboarding";
import { getProject, getWorkflow, listEvents, listMembers } from "./project";
import { detectFormatsTool, listBranches, listRepositoriesTool } from "./repos";
import { previewPublish, publish } from "./publish";
import { archiveProject, rotatePushToken, setBaseLocale, unarchiveProject, updateProject } from "./settings";
import { previewSync, syncRepository } from "./sync";
import { revertToLastSent, setTranslations } from "./translations";

/**
 * 구현된 도구 — 이름이 `toolCatalog()`의 이름과 같아야 한다(`lib/mcp/__tests__/tools-registry.test.ts`). 순서·annotations는 카탈로그가
 * 정본이고 여기는 이름 → 구현 대응만 든다.
 */
export const TOOLS: readonly ToolDefinition[] = [
  whoami, listProjects, getProject, listRepositoriesTool, listBranches, detectFormatsTool,
  listKeys, getKey, previewPublish, previewSync, previewRevertTool, listEvents, getWorkflow, listMembers,
  createProject, addSourcesTool, setTranslations, publish, syncRepository, revertToLastSent, updateProject, setBaseLocale,
  rotatePushToken, inviteMembersTool, revokeInvitation, changeMember, archiveProject, unarchiveProject,
];
