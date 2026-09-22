import { redirect } from "next/navigation";
import { requireSurfaceAccess } from "@/lib/surfaces/access";
import { routes } from "@/lib/routes";
export default async function LegacySurfaceLocales({ params }: { params: Promise<{ slug: string; surfaceSlug: string }> }) {
  const { slug, surfaceSlug } = await params;
  await requireSurfaceAccess({ slug, surfaceSlug, permission: "translation:write" });
  redirect(routes.sources(slug));
}
