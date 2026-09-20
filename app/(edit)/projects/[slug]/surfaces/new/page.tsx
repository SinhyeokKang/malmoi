import { notFound, redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

export default async function AddSurfacePage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<Raw<"e">>;
}) {
  const { slug } = await params;
  const { projectId } = await requireProjectAccess({ slug, permission: "project:settings" });
  const project = await getPrisma().project.findUnique({ where: { id: projectId }, select: { archivedAt: true } });
  if (!project || project.archivedAt !== null) notFound();
  const { e } = firstQueryValues(await searchParams);
  const query = new URLSearchParams({ add: "sources" });
  if (e) query.set("e", e);
  redirect(`${routes.settings(slug)}?${query}`);
}
