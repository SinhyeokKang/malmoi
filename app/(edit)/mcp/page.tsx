import { headers } from "next/headers";
import { CircleHelp } from "lucide-react";

import { ConnectedAppsCard, type ConnectedAppData } from "@/components/mcp/connected-apps-card";
import { TokenCard, type TokenCardData } from "@/components/mcp/token-card";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { deploymentMode, fallbackOrigin } from "@/lib/deployment/mode";
import { logCaught } from "@/lib/failure";
import { requestOrigin } from "@/lib/github-connect/origin";
import { getMessages } from "@/lib/i18n/server";
import { planConnectedApps, planTokenCard } from "@/lib/mcp/view";
import { routes } from "@/lib/routes";

/**
 * **MCP connector** (`/mcp` — PRODUCT §4.1 "MCP 커넥터" · 핸드오프 `design_handoff_mcp_connector`). 사용자 축이다 — 토큰은 계정에 붙는다.
 *
 * ⚠️ **`requireUser`만 지난다 — 인가할 프로젝트가 없다**(`/account`와 같다). 모든 조회는 세션의 `userId`로만 좁힌다(POSTMORTEM 2026-09-06).
 * ⚠️ **폭 fluid 1280 · 제목 = 사이드바 라벨**(`m.common.nav.mcp`). 핸드오프는 `/account`와 같은 limited 896이었고 **2026-09-29 사용자가 fluid로 바꿨다**(DESIGN §5.1 — 2026-09-30부터 폭 등급이 1280 하나다). 모달 열림은 클라이언트 상태라 딥링크가 없다.
 * ⚠️ **서버 URL은 이 요청의 origin이다** — preview에서 보면 preview 주소가 나와야 연결 조각을 그대로 쓸 수 있다. origin을 못 만들면
 * (허용 목록 밖 Host) 프로덕션 주소로 떨어진다.
 */
export default async function McpPage() {
  const m = await getMessages();
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

  const apps = await loadConnectedApps(userId, projects.map((p) => p.id), now);

  const head = await headers();
  // Host를 못 믿으면 이 배포의 정본 origin이다 — self-hosted가 SaaS 주소를 보이지 않는다. 판정이 무효면 경로만 보인다.
  const origin = requestOrigin({ host: head.get("host"), forwardedProto: head.get("x-forwarded-proto") })?.origin ?? fallbackOrigin(deploymentMode()) ?? "";

  return (
    <>
      <PanelHeader>
        {/*
          가이드 링크가 제목 행 우측이다(2026-09-30 사용자 — 본문 맨 아래의 헬퍼 문장을 걷었다). 글리프는 LNB Docs와 같은 `CircleHelp`다 —
          같은 곳(가이드)으로 가는 두 입구가 같은 기호를 쓴다. "무엇을 시킬 수 있나"의 정본은 가이드다 — 카탈로그 사본을 두지 않는다(낡는다).
        */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-medium">{m.common.nav.mcp}</h1>
          <ButtonLink href={routes.docs("ai-agents")}>
            <CircleHelp aria-hidden />
            {m.mcpConnector.guide.link}
          </ButtonLink>
        </div>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        {/* 주 경로(브라우저 로그인)의 결과가 맨 위다 — 관리 카드 위 · 설정 안내 아래의 배치를 잇는다(mcp-oauth 핸드오프 §4). */}
        <ConnectedAppsCard apps={apps} now={now.toISOString()} serverUrl={`${origin}/api/mcp`} />
        <TokenCard token={token} projects={projects} now={now.toISOString()} />
      </PanelBody>
    </>
  );
}

/**
 * 연결 목록 (mcp-oauth 핸드오프 §10.2). **결과가 둘이다** — 목록 또는 장애(`null` → `2i`). 장애를 빈 목록으로 접으면 "연결 없음"이 거짓으로 선다.
 * 토큰 카드와 달리 이 조회만 감싼다 — 연결 표면이 장애여도 토큰 카드는 선다(다른 카드는 선다 — 핸드오프 §0).
 * 만료 행도 싣는다 — 정리 규칙을 따로 두지 않고(삽입 시점 정리, design §4) 조회된 행을 그린다(§13 결정 4).
 */
async function loadConnectedApps(userId: string, memberProjectIds: string[], now: Date): Promise<ConnectedAppData[] | null> {
  try {
    const rows = await getPrisma().oAuthConnection.findMany({
      where: { userId },
      select: { id: true, clientId: true, clientName: true, grants: true, allProjects: true, projectIds: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return planConnectedApps({ rows, memberProjectIds, now }).map((app) => ({
      ...app,
      createdAt: app.createdAt.toISOString(),
      lastUsedAt: app.lastUsedAt?.toISOString() ?? null,
      expiresAt: app.expiresAt.toISOString(),
    }));
  } catch (error) {
    logCaught("mcp-oauth", "connections", error);
    return null;
  }
}
