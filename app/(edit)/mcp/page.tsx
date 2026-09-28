import { headers } from "next/headers";
import Link from "next/link";

import { ConnectCard } from "@/components/mcp/connect-card";
import { TokenCard, type TokenCardData } from "@/components/mcp/token-card";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { requestOrigin } from "@/lib/github-connect/origin";
import { m } from "@/lib/i18n";
import { planTokenCard } from "@/lib/mcp/view";
import { routes } from "@/lib/routes";

/**
 * **MCP connector** (`/mcp` — PRODUCT §4.1 "MCP 커넥터" · 핸드오프 `design_handoff_mcp_connector`). 사용자 축이다 — 토큰은 계정에 붙는다.
 *
 * ⚠️ **`requireUser`만 지난다 — 인가할 프로젝트가 없다**(`/account`와 같다). 모든 조회는 세션의 `userId`로만 좁힌다(POSTMORTEM 2026-09-06).
 * ⚠️ **폭 limited 896 · 제목 = 사이드바 라벨**(`m.common.nav.mcp`). 모달 열림은 클라이언트 상태라 딥링크가 없다.
 * ⚠️ **서버 URL은 이 요청의 origin이다** — preview에서 보면 preview 주소가 나와야 연결 조각을 그대로 쓸 수 있다. origin을 못 만들면
 * (허용 목록 밖 Host) 프로덕션 주소로 떨어진다.
 */
export default async function McpPage() {
  const { userId } = await requireUser();
  const prisma = getPrisma();
  const [row, members] = await Promise.all([
    prisma.apiToken.findUnique({
      where: { userId },
      select: { grants: true, allProjects: true, projectIds: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    }),
    prisma.projectMember.findMany({
      where: { userId, project: { archivedAt: null } },
      select: { project: { select: { id: true, name: true, repoOwner: true, repoName: true } } },
      orderBy: { project: { name: "asc" } },
    }),
  ]);
  const now = new Date();
  const projects = members.map(({ project }) => ({ id: project.id, name: project.name, repo: `${project.repoOwner}/${project.repoName}` }));
  const view = planTokenCard({ row, memberProjectIds: projects.map((p) => p.id), now });
  const token: TokenCardData =
    view.state === "none"
      ? view
      : { ...view, createdAt: view.createdAt.toISOString(), lastUsedAt: view.lastUsedAt?.toISOString() ?? null, expiresAt: view.expiresAt.toISOString() };

  const head = await headers();
  const origin = requestOrigin({ host: head.get("host"), forwardedProto: head.get("x-forwarded-proto") })?.origin ?? "https://mal-moi.com";

  return (
    <>
      <PanelHeader>
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.mcp}</h1>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <TokenCard token={token} projects={projects} now={now.toISOString()} />
        <ConnectCard serverUrl={`${origin}/api/mcp`} />
        {/*
          "무엇을 시킬 수 있나"의 정본은 가이드다 — 카탈로그 사본을 두지 않는다(낡는다).
          ⚠️ **지금은 문서 첫 페이지다** — `Connect an AI agent` 페이지가 아직 없다(M3 T9). 그 페이지가 서면 라벨(핸드오프 §12의
          `Connect an AI agent`)과 slug를 함께 바꾼다 — 없는 페이지 이름을 단 링크가 첫 페이지에 떨어지지 않게 지금은 일반 라벨이다.
        */}
        <p className="text-muted-foreground shrink-0 text-sm leading-[1.6]">
          {m.mcpConnector.guide.lead}{" "}
          <Link href={routes.docs()} className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none">
            {m.publicDocs.docs.title}
          </Link>
        </p>
      </PanelBody>
    </>
  );
}
