import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ArchivedPolicy } from "@/lib/auth/access";

import { toolCatalog, type ToolRequirement } from "../catalog";
import { planCreateAccess, planToolAccess } from "../grant";
import type { ToolOutcome } from "../result";
import type { ApiTokenSubject } from "../token-store";

/**
 * **도구 입구 판정** (mcp-connector design §1.25 · T6). 역할 ∩ 토큰을 **GitHub·코어보다 먼저** 본다 — 범위 밖·grant 없는 토큰이 남의
 * 레이트 리밋을 태우지 않고, 존재 여부도 새지 않는다. 판정 뒤 코어가 세션 경로와 같은 인가(`getProjectAccess` 등)를 한 번 더 지나고,
 * 쓰기는 잠금 뒤 토큰을 다시 읽는다 — 이 입구는 그 둘을 대신하지 않는다.
 *
 * 조건의 정본은 `toolCatalog()`다 — 도구 구현이 역할·grant를 자기 파일에 다시 적지 않는다(두 벌이면 한쪽이 낡는다).
 */

type Variant = "newProject" | "existingProject";

export function requirementOf(name: string, variant?: Variant): ToolRequirement {
  const spec = toolCatalog().find(tool => tool.name === name);
  if (spec === undefined) throw new Error(`unknown MCP tool ${name}`);
  if ("rolePermission" in spec.access) return spec.access;
  if (variant === undefined) throw new Error(`MCP tool ${name} needs an input variant`);
  return spec.access[variant];
}

/** 프로젝트 대상 도구. `ok`면 코어로 넘어간다 — 그 밖은 결과로 바로 돌려줄 거부다. */
export async function checkProjectTool(
  prisma: PrismaClient,
  subject: ApiTokenSubject,
  input: { name: string; slug: string; variant?: Variant; archivedPolicy?: ArchivedPolicy },
): Promise<{ status: "ok" } | ToolOutcome> {
  const requirement = requirementOf(input.name, input.variant);
  // ⚠️ 역할이 없는 요구는 프로젝트 도구가 아니다 — 카탈로그와 구현이 어긋났다(설정 오류라 던진다).
  if (requirement.rolePermission === null) throw new Error(`MCP tool ${input.name} has no project role requirement`);
  // `getProjectAccess`와 같은 두 조회 — 프로젝트 부재와 멤버 아님을 한 갈래로 접는다.
  const project = await prisma.project.findUnique({ where: { slug: input.slug }, select: { id: true, archivedAt: true } });
  const member = project === null ? null : await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: subject.userId } },
    select: { projectId: true, role: true },
  });
  const access = planToolAccess({
    token: subject, member, archivedAt: project?.archivedAt ?? null, archivedPolicy: input.archivedPolicy,
    rolePermission: requirement.rolePermission, tokenGrant: requirement.tokenGrant,
  });
  return access.status === "ok" ? { status: "ok" } : { status: "refused", code: access.status };
}

/** 프로젝트가 생기기 전의 도구(`list_repositories`·신규 `list_branches`·신규 `detect_formats`·`create_project`). */
export function checkCreateTool(subject: ApiTokenSubject, input: { name: string; variant?: Variant }): { status: "ok" } | ToolOutcome {
  const requirement = requirementOf(input.name, input.variant);
  if (requirement.tokenGrant === null) return { status: "ok" };
  return planCreateAccess({ grants: subject.grants }).status === "ok" ? { status: "ok" } : { status: "refused", code: "token-scope" };
}
