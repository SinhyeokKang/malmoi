import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import { GeneralCard } from "@/components/settings/general-card";
import { CiCard } from "@/components/settings/ci-card";
import { ArchiveCard } from "@/components/settings/archive-card";
import { RepositoryCard } from "@/components/settings/repository-card";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { PanelCard } from "@/components/ui/panel-card";
import { Alert } from "@/components/ui/alert";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { loadConnectionHealth } from "@/lib/github";
import { loadAccountView } from "@/lib/github-connect/account-view";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { planWorkflowStale, renderProjectWorkflowYaml, workflowSurfaceOf } from "@/lib/onboarding/workflow";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { routes } from "@/lib/routes";
import { utcMinute } from "@/lib/utc-time";
import { firstQueryValues, type Raw } from "@/lib/search-params";

export const maxDuration = 60;
export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Raw<"e" | "add">> }) {
  const { slug } = await params;
  // Pages and layouts render independently: authorize before any query or external read.
  const { projectId, userId } = await requireProjectAccess({ slug, permission: "project:settings" });
  const { e, add } = firstQueryValues(await searchParams);
  if (add === "sources") redirect(routes.sources(slug, { add, e }));
  const notice = isConnectError(e) ? connectErrorMessage(e) : null;
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: {
    name: true, image: true, repoOwner: true, repoName: true, installationId: true, repositoryId: true,
    surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" } }, baseBranch: true, archivedAt: true,
  } });
  if (project === null) redirect(`${routes.projects()}?e=not-found`);
  /*
    ⚠️ **셋 다 await하지 않는다** (audit-ux #8) — 전부 GitHub 왕복이고(연결 확인은 설치 조회·토큰·리포 조회), 쓰는
    자리는 연결 카드의 세 줄과 보관 Dialog의 한 줄뿐이다. promise로 내려 그 자리만 Suspense 뒤에서 도착하게 한다 —
    이름·CI·보관 버튼은 DB 값만으로 먼저 선다. 셋은 여기서 **동시에 출발한다**(렌더가 기다리지 않을 뿐이다).
    ⚠️ **거부를 삼키지 않는다** — `loadConnectionHealth`가 던지는 것은 환경변수 누락뿐이고 그것은 이 화면에서 500이
    정직하다(`probeRepo` 주석). 풀린 promise의 거부는 `use`가 가장 가까운 오류 경계로 올린다.
  */
  const health = loadConnectionHealth(project);
  const account = loadAccountView(prisma, userId);
  const openPrUrl = loadOpenPrUrl(slug, project);
  const archived = project.archivedAt !== null;
  const archive = <PanelCard title={archived ? m.archive.restore : m.archive.title}>
    <div className="flex items-center justify-between gap-4 px-4 py-[13px] @max-[640px]:grid @max-[640px]:grid-cols-[28px_1fr] @max-[640px]:items-start @max-[640px]:[&>[data-archive-card]]:col-start-2 @max-[640px]:[&>[data-archive-card]]:justify-self-start">
      <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded"><Archive className="size-4" aria-hidden /></span><p className="text-muted-foreground flex-1 text-xs">{archived ? m.archive.archivedBy(<time dateTime={project.archivedAt!.toISOString()}>{utcMinute(project.archivedAt!)}</time>) : m.archive.description}</p>
      <ArchiveCard slug={slug} name={project.name} archived={archived} openPrUrl={openPrUrl} />
    </div>
  </PanelCard>;
  const workflow = project.surfaces.length > 0 && <WorkflowBlock yaml={renderProjectWorkflowYaml({ slug, baseBranch: project.baseBranch, surfaces: project.surfaces.map(workflowSurfaceOf) })} />;
  return <>
    <PanelHeader>{notice !== null && <Alert variant="danger">{notice}</Alert>}<h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.projectSettings}</h1></PanelHeader>
    <PanelBody className="space-y-4">
      {archived && archive}
      <GeneralCard slug={slug} name={project.name} image={project.image} archived={archived} />
      <RepositoryCard slug={slug} owner={project.repoOwner} repo={project.repoName} branch={project.baseBranch} archived={archived} health={health} account={account} appSlug={optionalEnv("GITHUB_APP_SLUG")} />
      <CiCard slug={slug} archived={archived} stale={planWorkflowStale(project.surfaces)}>{workflow}</CiCard>
      {!archived && archive}
    </PanelBody>
  </>;
}
