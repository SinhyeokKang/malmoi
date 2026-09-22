import { notFound } from "next/navigation";
import { SourcesScreen } from "@/components/sources/sources-screen";
import { ProjectArchived } from "@/components/project-archived";
import { Alert } from "@/components/ui/alert";
import { requireProjectAccess } from "@/lib/auth/session";
import { canPerform } from "@/lib/auth/permission";
import { ADAPTERS } from "@/lib/adapters";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { formatLabel } from "@/lib/onboarding/detect";
import { firstQueryValues, type Raw } from "@/lib/search-params";
import { loadSources } from "@/lib/sources/query";

export const maxDuration = 60;
export default async function SourcesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Raw<"add" | "e" | "source">> }) {
  const { slug } = await params;
  const { projectId, role, archived } = await requireProjectAccess({ slug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;
  const { add, e } = firstQueryValues(await searchParams);
  const canEdit = canPerform(role, "project:settings");
  const data = await loadSources(getPrisma(), projectId, role);
  if (data === null) notFound();
  return <>
    {isConnectError(e) && <Alert variant="danger">{connectErrorMessage(e)}</Alert>}
    {add === "sources" && !canEdit && <Alert variant="warning">{m.sources.ownerOnly}</Alert>}
    <SourcesScreen slug={slug} role={role} data={data} now={new Date()} initialOpen={canEdit && add === "sources"}
      adapters={canEdit ? ADAPTERS.map(a => ({ adapter: a.name, layout: a.layout, ...formatLabel(a.name) })) : []} />
  </>;
}
