import { redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
export default async function LegacyLocales({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireProjectAccess({ slug, permission: "translation:write" });
  redirect(routes.sources(slug));
}
