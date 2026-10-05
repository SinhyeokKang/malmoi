import "server-only";
import { z } from "zod";

import { decodeUser, readable } from "@/lib/credentials/records";
import { APP_ACCOUNT_PROVIDER } from "@/lib/github-connect/account-link";
import { en } from "@/messages/en";
import { planProjectReadiness } from "@/lib/onboarding/readiness";

import { inScope } from "../grant";
import { defineTool, ok } from "./define";

/**
 * 계정 축 읽기 둘 — 토큰이 준 `userId`로만 좁힌다(POSTMORTEM 2026-09-06). 프로젝트 역할 조건이 없다(`toolCatalog`).
 */

export const whoami = defineTool({
  name: "whoami",
  inputSchema: z.object({}),
  async run({ prisma, subject }) {
    const [user, github, token, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: subject.userId }, select: { id: true, name: true } }),
      prisma.account.findFirst({ where: { userId: subject.userId, provider: APP_ACCOUNT_PROVIDER }, select: { providerAccountId: true } }),
      // 해시까지 조건이다 — 재발급된 새 행의 만료를 옛 토큰의 것으로 말하지 않는다. OAuth는 **연결 수명**이다 — access의 1시간이 아니다
      // (에이전트가 "한 시간 뒤 끊긴다"고 말하면 틀린다. access는 클라이언트가 조용히 refresh한다).
      subject.credential.kind === "api-token"
        ? prisma.apiToken.findFirst({ where: { userId: subject.userId, tokenHash: subject.credential.tokenHash }, select: { expiresAt: true } })
        : prisma.oAuthConnection.findFirst({ where: { userId: subject.userId, id: subject.credential.connectionId }, select: { expiresAt: true } }),
      subject.scope.kind === "all" ? Promise.resolve([]) : prisma.projectMember.findMany({
        where: { userId: subject.userId, project: { archivedAt: null } }, select: { project: { select: { id: true, slug: true } } },
      }),
    ]);
    const scoped = memberships.filter(row => inScope(subject.scope, row.project.id)).map(row => row.project.slug).sort();
    // 못 여는 봉투(키 회전 중)는 이름이 없는 것으로 말한다 — 원문 대신 봉투를 싣지 않는다.
    const name = user === null ? null : readable(() => decodeUser(user).name) ?? null;
    return ok({
      user: { name },
      github: { connected: github !== null },
      token: {
        grants: [...subject.grants],
        // 내부 id 대신 에이전트가 도구에 넘길 slug다 — 지금 멤버인 비보관 프로젝트 중 범위 안의 것만(나간 프로젝트의 id를 말하지 않는다).
        scope: subject.scope.kind === "all" ? { kind: "all" } : { kind: "projects", projects: scoped },
        expiresAt: token?.expiresAt.toISOString() ?? null,
      },
    }, name === null ? en.mcp.summary.signedIn : en.mcp.summary.signedInAs(name));
  },
});

export const listProjects = defineTool({
  name: "list_projects",
  inputSchema: z.object({}),
  async run({ prisma, subject }) {
    const rows = await prisma.projectMember.findMany({
      where: { userId: subject.userId },
      select: {
        role: true,
        project: {
          select: {
            id: true, slug: true, name: true, repoOwner: true, repoName: true, baseBranch: true, archivedAt: true, installationId: true,
            surfaces: { select: { archivedAt: true, lastCommitSha: true } },
          },
        },
      },
      orderBy: { project: { slug: "asc" } },
    });
    // 멤버십 ∩ 토큰 범위 — 범위 밖 프로젝트는 존재 자체를 말하지 않는다.
    const projects = rows.filter(row => inScope(subject.scope, row.project.id)).map(({ role, project }) => ({
      slug: project.slug,
      name: project.name,
      role,
      repository: `${project.repoOwner}/${project.repoName}`,
      baseBranch: project.baseBranch,
      archived: project.archivedAt !== null,
      readiness: planProjectReadiness(project),
    }));
    return ok({ projects }, en.mcp.summary.projects(projects.length));
  },
});
