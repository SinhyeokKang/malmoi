import { notFound } from "next/navigation";
import { AddSurface } from "@/components/onboarding/add-surface";
import { ADAPTERS } from "@/lib/adapters";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { logCaught } from "@/lib/failure";
import { formatLabel } from "@/lib/onboarding/detect";
import { firstQueryValues, type Raw } from "@/lib/search-params";
import { detectRepoFormats, type DetectResult } from "../../../actions";

export const maxDuration = 60;

export default async function AddSurfacePage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<Raw<"e">>;
}) {
  const { slug } = await params;
  const { projectId } = await requireProjectAccess({ slug, permission: "project:settings" });
  const project = await getPrisma().project.findUnique({ where: { id: projectId } });
  if (!project || project.archivedAt !== null) notFound();
  const { e } = firstQueryValues(await searchParams);
  let initial: DetectResult;
  try { initial = await detectRepoFormats({ owner: project.repoOwner, repo: project.repoName, ref: project.baseBranch }); }
  catch (error) {
    logCaught("surface", "detect", error);
    initial = { ok: false, error: "unavailable" };
  }
  return <AddSurface slug={slug} owner={project.repoOwner} repo={project.repoName} branch={project.baseBranch}
    adapters={ADAPTERS.map(a => ({ adapter: a.name, layout: a.layout, ...formatLabel(a.name) }))}
    initial={initial} initialError={e} />;
}
