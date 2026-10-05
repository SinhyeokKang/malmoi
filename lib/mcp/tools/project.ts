import "server-only";
import { z } from "zod";

import { getProjectAccess, loadMembers, loadPendingInvitations } from "@/lib/auth/query";
import { encodeCursor, parseLogFilter } from "@/lib/events/filter";
import { loadEvents } from "@/lib/events/query";
import { loadConnectionHealth } from "@/lib/github";
import { logFailure } from "@/lib/github-connect/log";
import { en } from "@/messages/en";
import { loadProjectListAggregates, loadSurfaceCounts } from "@/lib/keys/query";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { renderProjectWorkflowYaml, workflowApiUrl, workflowSurfaceOf } from "@/lib/onboarding/workflow";

import { checkProjectTool } from "./access";
import { defineTool, ok } from "./define";

/**
 * 프로젝트 축 읽기 넷 (design §2.1). 입구 판정(`checkProjectTool`) → 세션 경로와 같은 인가(`getProjectAccess`) → 기존 조회. **`projectId`는
 * 인가가 돌려준 값만 쓴다** — slug로 다시 찾지 않는다(불변식 5).
 */

const Slug = z.object({ slug: z.string().min(1).max(200) });

export const getProject = defineTool({
  name: "get_project",
  inputSchema: Slug,
  async run({ prisma, subject }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "get_project", slug });
    if (gate.status !== "ok") return gate;
    const access = await getProjectAccess(prisma, { userId: subject.userId, slug, permission: "translation:write" });
    if (access.status !== "ok") return { status: "refused", code: access.status };
    const project = await prisma.project.findUnique({
      where: { id: access.projectId },
      select: {
        slug: true, name: true, repoOwner: true, repoName: true, baseBranch: true, installationId: true, repositoryId: true,
        archivedAt: true, lastPublishedAt: true, lastPrUrl: true,
        surfaces: {
          where: { archivedAt: null }, orderBy: { slug: "asc" },
          select: { id: true, slug: true, adapterName: true, pathTemplate: true, baseLocale: true, declaredBaseLocale: true, archivedAt: true, lastCommitSha: true,
            locales: { where: { orphaned: false }, select: { code: true, isBase: true }, orderBy: { code: "asc" } } },
        },
      },
    });
    if (project === null) return { status: "refused", code: "not-found" };
    const [aggregates, counts, health] = await Promise.all([
      loadProjectListAggregates(prisma, [access.projectId]),
      loadSurfaceCounts(prisma, access.projectId),
      // Home과 같은 판단 — GitHub 설정 오류(던짐)가 조회 전체를 죽이지 않는다. 모르면 `unknown`이다.
      loadConnectionHealth(project).catch((error: unknown) => { logFailure("mcp-connection-health", error); return { status: "unknown" as const }; }),
    ]);
    const keysOf = new Map(counts.map(c => [c.surfaceId, c.keys]));
    return ok({
      slug: project.slug,
      name: project.name,
      role: access.role,
      archived: project.archivedAt !== null,
      readiness: planProjectReadiness(project),
      repository: `${project.repoOwner}/${project.repoName}`,
      baseBranch: project.baseBranch,
      // ⚠️ **출력 값 목록을 넓히지 않는다** (ux-drift-unify Q12) — 화면의 `unpinned`(설치 있음·리포 id 없음)는 외부 계약에서 `not-connected`다.
      connection: health.status === "unpinned" ? "not-connected" : health.status,
      toSend: aggregates.unsent.get(access.projectId) ?? 0,
      newFromGitHub: aggregates.newKeys.get(access.projectId) ?? 0,
      // ⚠️ **마지막 Publish의 PR이지 열린 PR이 아니다** (#144) — 성공한 Publish가 쓴 값이고 그 뒤 닫혔을 수 있다. Home의 "Last publish: Pull request #N"과
      // 같은 값이다. 지금 열려 있는지는 `preview_publish`가 GitHub을 보고 답한다 — 여기서 GitHub을 부르지 않는다.
      lastPublishPullRequest: project.lastPrUrl,
      lastPublishedAt: project.lastPublishedAt?.toISOString() ?? null,
      sources: project.surfaces.map(surface => ({
        slug: surface.slug, adapter: surface.adapterName, pathTemplate: surface.pathTemplate, baseLocale: surface.baseLocale,
        declaredBaseLocale: surface.declaredBaseLocale, keys: keysOf.get(surface.id) ?? 0, locales: surface.locales.map(l => l.code),
      })),
    }, en.mcp.summary.project(project.name));
  },
});

export const listEvents = defineTool({
  name: "list_events",
  inputSchema: Slug.extend({ query: z.record(z.string().max(64), z.string().max(1024)).optional() }),
  async run({ prisma, subject }, { slug, query }) {
    // ⚠️ 보관 중 읽기 예외 — 보관 사건과 그 직전 기록을 보려고 복원해야 하는 순환을 끊는다(PRODUCT §3).
    const gate = await checkProjectTool(prisma, subject, { name: "list_events", slug, archivedPolicy: "read" });
    if (gate.status !== "ok") return gate;
    const access = await getProjectAccess(prisma, { userId: subject.userId, slug, permission: "translation:write", archivedPolicy: "read" });
    if (access.status !== "ok") return { status: "refused", code: access.status };
    // 필터·커서는 Logs 화면과 같은 해석이다 — 주소창 값과 같은 이름을 받는다.
    // ⚠️ 기간은 **UTC 자정으로 끊는다** — MCP는 세션·쿠키를 읽지 않으므로 보는 사람의 시간대가 없다(응답 시각도 ISO다).
    const page = await loadEvents(prisma, en, access.projectId, parseLogFilter(query ?? {}), { timeZone: "UTC" });
    return ok({
      events: page.rows.map(row => ({
        ref: row.ref, kind: row.kind, subtype: row.subtype, occurredAt: row.occurredAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null,
        result: row.result, actor: { kind: row.actor.kind, name: row.actor.name, emailLabel: row.actor.emailLabel, removed: row.actor.removed },
        payload: row.payload,
      })),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    }, en.mcp.summary.events(page.rows.length));
  },
});

export const listMembers = defineTool({
  name: "list_members",
  inputSchema: Slug,
  async run({ prisma, subject, now }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "list_members", slug });
    if (gate.status !== "ok") return gate;
    const access = await getProjectAccess(prisma, { userId: subject.userId, slug, permission: "translation:write" });
    if (access.status !== "ok") return { status: "refused", code: access.status };
    // 이메일은 마스킹 라벨만 — 로더가 원문을 내지 않는다(sec-audit 발견 4). 대기 초대는 초대할 수 있는 OWNER에게만 보인다(멤버 화면과 같다).
    const [members, pending] = await Promise.all([
      loadMembers(prisma, en, access.projectId),
      access.role === "OWNER" ? loadPendingInvitations(prisma, en, access.projectId, now) : Promise.resolve([]),
    ]);
    return ok({
      members: members.map(member => ({ userId: member.userId, name: member.name, emailLabel: member.emailLabel, role: member.role, joinedAt: member.joinedAt.toISOString() })),
      pendingInvitations: pending.map(invitation => ({ id: invitation.id, emailLabel: invitation.emailLabel, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() })),
    }, en.mcp.summary.members(members.length));
  },
});

export const getWorkflow = defineTool({
  name: "get_workflow",
  inputSchema: Slug,
  async run({ prisma, subject, origin }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "get_workflow", slug });
    if (gate.status !== "ok") return gate;
    const access = await getProjectAccess(prisma, { userId: subject.userId, slug, permission: "project:settings" });
    if (access.status !== "ok") return { status: "refused", code: access.status };
    const project = await prisma.project.findUnique({
      where: { id: access.projectId },
      select: { baseBranch: true, surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" } } },
    });
    if (project === null || project.surfaces.length === 0) return { status: "refused", code: "not-ready" };
    // push 토큰 원문은 없다 — YAML은 `${{ secrets.PUSH_TOKEN }}`만 가리킨다. 원문은 `rotate_push_token`의 결과에만 있다.
    // `api-url`은 이 요청이 들어온 앱을 가리킨다 — 프로덕션·모르는 origin은 생략(`workflowApiUrl`).
    const apiUrl = workflowApiUrl(origin);
    const yaml = renderProjectWorkflowYaml({ slug, baseBranch: project.baseBranch, surfaces: project.surfaces.map(workflowSurfaceOf), ...(apiUrl === undefined ? {} : { apiUrl }) });
    return ok({ path: ".github/workflows/malmoi-i18n.yml", yaml, secretName: "PUSH_TOKEN" }, en.mcp.summary.workflow);
  },
});
