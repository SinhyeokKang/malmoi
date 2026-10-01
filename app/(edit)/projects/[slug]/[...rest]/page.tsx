import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth/session";

/**
 * 프로젝트 셸 안의 **맞는 라우트가 없는 주소** (malmoi#167). 이 파일이 없으면 Next가 루트 `app/not-found.tsx`를 그려
 * 셸 안에 패널·글리프 없는 셸 밖 형이 섰다 — `notFound()`를 던져 `[slug]/not-found`(셸 안 형)가 들게 한다.
 * 정적·동적 형제 라우트가 catch-all보다 먼저 맞으므로 실제 화면을 가리지 않는다.
 * ⚠️ 인가를 먼저 지난다 — 모르는 slug·비멤버는 다른 화면과 같이 목록으로 redirect되어 404 형으로 존재 여부를 흘리지 않는다.
 */
export default async function UnmatchedProjectRoute({ params }: { params: Promise<{ slug: string; rest: string[] }> }) {
  const { slug } = await params;
  await requireProjectAccess({ slug, permission: "translation:write" });
  notFound();
}
