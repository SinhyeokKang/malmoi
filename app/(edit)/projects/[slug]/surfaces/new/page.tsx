import { redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/**
 * ⚠️ **옛 링크 호환용이다** (audit-ux #31) — 앱 안에서 여기로 보내는 곳은 0이다. GitHub callback도 Sources의 추가 모달로
 * 바로 간다. 지우지 않는 이유는 옛 `/translations`와 같다: 북마크·외부 링크로 들어온 사람이 404를 만나지 않는다.
 */
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
