import { notFound, redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

export const maxDuration = 60;
/**
 * ⚠️ **`state`가 여기도 있어야 한다** (project-home §9.7) — Home의 카운트 카드가 이 공가 라우트를
 * 가리키고, 여기서 빠지면 `firstQueryValues`가 그 키를 안 실어 **redirect가 좁힘을 버린다.**
 */
type Search = Raw<"ns" | "locales" | "q" | "state">;
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
