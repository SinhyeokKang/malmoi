import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import { GeneralCard } from "@/components/settings/general-card";
import { SourcesCard } from "@/components/settings/sources-card";
import { CiCard } from "@/components/settings/ci-card";
import { ArchiveCard } from "@/components/settings/archive-card";
import { RepositoryCard } from "@/components/settings/repository-card";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { PanelCard } from "@/components/ui/panel-card";
import { Alert } from "@/components/ui/alert";
import { ADAPTERS } from "@/lib/adapters";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { loadConnectionHealth } from "@/lib/github";
import { loadAccountView } from "@/lib/github-connect/account-view";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { loadSurfaceCounts } from "@/lib/keys/query";
import { formatLabel } from "@/lib/onboarding/detect";
import { planWorkflowStale, renderProjectWorkflowYaml, workflowSurfaceOf } from "@/lib/onboarding/workflow";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

export const maxDuration = 60;
export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Raw<"e" | "add">> }) {
  const { slug } = await params;
  // Pages and layouts render independently: authorize before any query or external read.
  const { projectId, userId } = await requireProjectAccess({ slug, permission: "project:settings" });
  const { e, add } = firstQueryValues(await searchParams);
  const notice = isConnectError(e) ? connectErrorMessage(e) : null;
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: {
    name: true, image: true, repoOwner: true, repoName: true, installationId: true, repositoryId: true,
    surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" } }, baseBranch: true, archivedAt: true,
  } });
  if (project === null) redirect(`${routes.projects()}?e=not-found`);
  const [health, account, openPrUrl, counts] = await Promise.all([
    loadConnectionHealth(project), loadAccountView(prisma, userId), loadOpenPrUrl(slug, project), loadSurfaceCounts(prisma, projectId),
  ]);
  const archived = project.archivedAt !== null;
  const archive = <PanelCard title={archived ? m.archive.restore : m.archive.title}>
    <div className="flex items-center justify-between gap-4 px-4 py-[13px] @max-[640px]:grid @max-[640px]:grid-cols-[28px_1fr] @max-[640px]:items-start @max-[640px]:[&>button]:col-start-2 @max-[640px]:[&>button]:justify-self-start">
      <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded"><Archive className="size-4" aria-hidden /></span><p className="text-muted-foreground flex-1 text-xs">{archived ? m.archive.archivedBy(project.archivedAt!.toLocaleDateString("en-US", { timeZone: "UTC" })) : m.archive.description}</p>
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
      <SourcesCard slug={slug} owner={project.repoOwner} repo={project.repoName} branch={project.baseBranch} installationId={project.installationId} archived={archived} sources={project.surfaces} counts={counts} adapters={ADAPTERS.map(a => ({ adapter: a.name, layout: a.layout, ...formatLabel(a.name) }))} now={new Date()} initialOpen={add === "sources"} />
      <CiCard slug={slug} archived={archived} stale={planWorkflowStale(project.surfaces)}>{workflow}</CiCard>
      {!archived && archive}
    </PanelBody>
  </>;
}
