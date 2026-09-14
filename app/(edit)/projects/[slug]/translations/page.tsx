import { notFound, redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

export const maxDuration = 60;
type Search = Raw<"ns" | "locales" | "q">;
export default async function LegacyTranslations({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const { projectId } = await requireProjectAccess({ slug, permission: "translation:write" });
  const project = await getPrisma().project.findUnique({ where: { id: projectId }, select: { defaultSurface: true } });
  const surface = project?.defaultSurface;
  if (!surface || surface.archivedAt !== null) notFound();
  redirect(routes.surfaceTranslations(slug, surface.slug, firstQueryValues(await searchParams)));
}
