import { redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

export default async function AddSurfacePage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<Raw<"e">>;
}) {
  const { slug } = await params;
  await requireProjectAccess({ slug, permission: "project:settings" });
  /*
    ⚠️ **보관 프로젝트도 보낸다** (audit #16 — PRODUCT §7.7) — 전엔 `notFound()`라 "Translation surface unavailable"이
    섰다. Sources가 보관을 먼저 보고 보관 화면을 그리므로 모달은 열리지 않는다.
  */
  const { e } = firstQueryValues(await searchParams);
  redirect(routes.sources(slug, { add: "sources", e }));
}
