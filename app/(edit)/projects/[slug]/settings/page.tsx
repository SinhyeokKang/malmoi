import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import { GeneralCard } from "@/components/settings/general-card";
import { CiCard } from "@/components/settings/ci-card";
import { ArchiveCard } from "@/components/settings/archive-card";
import { RepositoryCard } from "@/components/settings/repository-card";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { loadConnectionHealth } from "@/lib/repo-host";
import { repoTargetOf } from "@/lib/repo-host/target";
import { loadAccountView } from "@/lib/github-connect/account-view";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { getDateStyle, getMessages } from "@/lib/i18n/server";
import { requestOrigin } from "@/lib/github-connect/origin";
import { planWorkflowStale, workflowApiUrl, workflowSurfaceOf } from "@/lib/onboarding/workflow";
import { ciFileOf } from "@/lib/onboarding/ci-file";
import { RepoHostScope } from "@/components/i18n/messages-provider";
import { withRepoHost } from "@/lib/i18n/host";
import { githubAppConfigured } from "@/lib/deployment/github-app";
import { readGitLabConnection } from "@/lib/gitlab-connect/connection";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { routes } from "@/lib/routes";
import { formatDay } from "@/lib/date-format";
import { firstQueryValues, type Raw } from "@/lib/search-params";
import { IconTile } from "@/components/ui/icon-tile";

export const maxDuration = 60;
export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Raw<"e" | "add">> }) {
  const style = await getDateStyle();
  const messages = await getMessages();
  const { slug } = await params;
  // Pages and layouts render independently: authorize before any query or external read.
  const { projectId, userId } = await requireProjectAccess({ slug, permission: "project:settings" });
  const { e, add } = firstQueryValues(await searchParams);
  if (add === "sources") redirect(routes.sources(slug, { add, e }));
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: {
    name: true, image: true, repoOwner: true, repoName: true, repoHost: true, installationId: true, gitlabConnectionId: true, repositoryId: true,
    surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" } }, baseBranch: true, archivedAt: true,
    // GitLab 연결 카드의 토큰 줄 — 참조하는 연결의 주인·만료일(DB 값, D21). 토큰 봉투는 읽지 않는다.
    gitlabConnection: { select: { username: true, expiresAt: true, userId: true, _count: { select: { projects: true } } } },
  } });
  if (project === null) redirect(routes.projects({ e: "not-found" }));
  // 이 프로젝트의 화면 전체가 그 리포 호스트의 문장을 말한다(`withRepoHost` — 클라이언트 조각은 `RepoHostScope`).
  const m = withRepoHost(messages, project.repoHost);
  const notice = isConnectError(e) ? connectErrorMessage(m, e) : null;
  const gitlabHost = project.repoHost === "gitlab";
  /*
    ⚠️ **셋 다 await하지 않는다** (audit-ux #8) — 전부 GitHub 왕복이고(연결 확인은 설치 조회·토큰·리포 조회), 쓰는
    자리는 연결 카드의 세 줄과 보관 Dialog의 한 줄뿐이다. promise로 내려 그 자리만 Suspense 뒤에서 도착하게 한다 —
    이름·CI·보관 버튼은 DB 값만으로 먼저 선다. 셋은 여기서 **동시에 출발한다**(렌더가 기다리지 않을 뿐이다).
    ⚠️ **거부를 삼키지 않는다** — `loadConnectionHealth`가 던지는 것은 환경변수 누락뿐이고 그것은 이 화면에서 500이
    정직하다(`probeRepo` 주석). 풀린 promise의 거부는 `use`가 가장 가까운 오류 경계로 올린다.
  */
  const connection = repoTargetOf(project);
  const health = loadConnectionHealth(connection);
  // GitHub 계정 복구 줄의 근거 — GitLab 프로젝트·App 없는 설치(D4a)는 GitHub을 부르지 않는다.
  const account = gitlabHost || !githubAppConfigured() ? undefined : loadAccountView(prisma, userId);
  const viewerGitLab = gitlabHost ? await readGitLabConnection(prisma, userId) : null;
  const openPrUrl = loadOpenPrUrl(slug, project);
  const archived = project.archivedAt !== null;
  // 연결 행의 Disconnected와 같은 DB 판정이다(D1) — 브랜치 목록·토큰 회전이 거부될 요청을 부르지 않는다(malmoi#159).
  // GitLab 참조 비움(`connection-removed`, D21)도 같은 Disconnected다 — 브랜치 목록·토큰 회전이 거부될 요청을 부르지 않는다.
  const unpinned = connection.status === "unpinned" || connection.status === "connection-removed";
  const archive = <Card title={archived ? m.archive.restore : m.archive.title}>
    <div className="flex items-center justify-between gap-4 px-4 py-row-y @max-form:grid @max-form:grid-cols-[28px_1fr] @max-form:items-start @max-form:[&>[data-archive-card]]:col-start-2 @max-form:[&>[data-archive-card]]:justify-self-start">
      <IconTile><Archive aria-hidden /></IconTile><p className="text-muted-foreground flex-1 text-xs">{archived ? m.archive.archivedBy(<time dateTime={project.archivedAt!.toISOString()}>{formatDay(project.archivedAt!, style)}</time>) : m.archive.description}</p>
      <ArchiveCard slug={slug} name={project.name} archived={archived} openPrUrl={openPrUrl} />
    </div>
  </Card>;
  /*
   * CI 파일 — 리포 호스트의 생성기(`ciFileOf` — MCP `get_workflow`와 같은 함수)다. `api-url`은 이 화면을 연 앱을 가리킨다 — 워크플로를 그릴 때만
   * 요청 헤더를 읽는다. GitLab은 릴리스 SHA가 없으면 `null`이고 블록 대신 "아직 없다"를 말한다(R-D1).
   */
  const ciHost = gitlabHost ? "gitlab" : "github";
  const origin = project.surfaces.length > 0 ? await requestAppOrigin() : null;
  const ciFile = project.surfaces.length > 0 ? ciFileOf(ciHost, { slug, baseBranch: project.baseBranch, surfaces: project.surfaces.map(workflowSurfaceOf), origin }) : null;
  const workflow = project.surfaces.length > 0 && <WorkflowBlock m={m} host={ciHost} yaml={ciFile?.yaml ?? ""} />;
  return <RepoHostScope host={project.repoHost}>
    <PanelHeader><h1 className="flex items-center text-lg font-medium">{m.common.nav.projectSettings}</h1></PanelHeader>
    <PanelBody className="space-y-4">
      {/* 거부 Alert는 본문의 첫 블록이다 — 본문과 함께 스크롤한다(2026-10-01 사용자 — 머리는 제목 한 띠로 고정. 그 전 4-Y7은 머리 안 제목 아래, 더 전엔 h1 위였다). */}
      {notice !== null && <Alert variant="danger">{notice}</Alert>}
      {archived && archive}
      <GeneralCard slug={slug} name={project.name} image={project.image} archived={archived} />
      <RepositoryCard slug={slug} owner={project.repoOwner} repo={project.repoName} branch={project.baseBranch} archived={archived} unpinned={unpinned} health={health} account={account} appSlug={optionalEnv("GITHUB_APP_SLUG")}
        gitlab={gitlabHost ? {
          token: project.gitlabConnection === null ? null : { username: project.gitlabConnection.username, expiresAt: project.gitlabConnection.expiresAt?.toISOString() ?? null, viewerIsOwner: project.gitlabConnection.userId === userId, projectCount: project.gitlabConnection._count.projects },
          viewer: viewerGitLab === null ? null : { username: viewerGitLab.username },
        } : undefined} />
      <CiCard slug={slug} host={ciHost} archived={archived} unpinned={unpinned} stale={planWorkflowStale(project.surfaces)}>{workflow}</CiCard>
      {!archived && archive}
    </PanelBody>
  </RepoHostScope>;
}

/** dev에서 복사한 워크플로가 프로덕션으로 push하지 않게(preview QA T9) — `requestOrigin`이 허용 목록과 대조한 origin만. 프로덕션·모르는 값의 생략은 `ciFileOf`(`workflowApiUrl`)가 한다. */
async function requestAppOrigin(): Promise<string | null> {
  const head = await headers();
  return requestOrigin({ host: head.get("host"), forwardedProto: head.get("x-forwarded-proto") })?.origin ?? null;
}
