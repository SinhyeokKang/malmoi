import { notFound, redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import type { Raw } from "@/lib/search-params";
import { screenQuery, serializeScreenQuery } from "@/lib/translations/query";

export const maxDuration = 60;
/**
 * ⚠️ **`state`가 여기도 있어야 한다** (PRODUCT §7.7) — Home의 카운트 카드가 이 공가 라우트를
 * 가리키고, 여기서 빠지면 `firstQueryValues`가 그 키를 안 실어 **redirect가 좁힘을 버린다.**
 */
type Search = Raw<"ns" | "locales" | "q" | "state" | "scope" | "completion" | "missingLocale" | "cursor" | "key" | "keySurface" | "language" | "focus">;
export default async function LegacyTranslations({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const { projectId } = await requireProjectAccess({ slug, permission: "translation:write" });
  const project = await getPrisma().project.findUnique({ where: { id: projectId }, select: { defaultSurface: true } });
  const surface = project?.defaultSurface;
  if (!surface || surface.archivedAt !== null) notFound();
  // ⚠️ 주소창 값이라 허용 목록 파서를 지난다 — 모르는 값은 실어 보내지 않는다 (POSTMORTEM 2026-09-08). 옛 키는 화면 정규형으로 옮긴다.
  // 소스·키·언어의 존재 보정은 목적지 페이지가 한다(translation-tree-range design §3.1).
  redirect(routes.surfaceTranslations(slug, surface.slug, serializeScreenQuery(screenQuery(await searchParams))));
}
