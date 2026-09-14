import "server-only";
import { notFound } from "next/navigation";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Permission } from "@/lib/auth/permission";
import { requireProjectAccess } from "@/lib/auth/session";
import { getProjectAccess } from "@/lib/auth/query";
import { getPrisma } from "@/lib/db";

export async function requireSurfaceAccess(input: { slug: string; surfaceSlug: string; permission: Permission }) {
  const access = await requireProjectAccess(input);
  const surface = await getPrisma().translationSurface.findFirst({
    where: { projectId: access.projectId, slug: input.surfaceSlug, archivedAt: null },
  });
  if (!surface) notFound();
  return { ...access, surfaceId: surface.id, surface };
}

/**
 * Server Action용. **`requireSurfaceAccess`와 거부 모양이 다르다** — 그쪽은 페이지라 404가 옳고,
 * 이쪽 호출자는 `{ ok: false, error }`를 화면에 돌려줘야 한다 (CLAUDE.md "데이터 변경 경로").
 * ⚠️ **여기서 `notFound()`를 던지면 `saveTranslation`의 `SaveResult` 계약이 깨진다** — 번역자가
 * 입력하던 값이 404 렌더와 함께 사라지고, "your text is kept"가 거짓이 된다.
 *
 * ⚠️ **`not-found`를 재사용한다** — 프로젝트 부재와 같은 이유로 표면의 존재 여부를 노출하지 않고,
 * `ProjectAccess` 유니온에 이미 있어 `ACCESS_ERRORS`를 손으로 늘리지 않는다 (`app/(edit)/actions.ts`).
 */
export async function getSurfaceAccess(prisma: PrismaClient, input: {
  slug: string; surfaceSlug: string; userId: string; permission: Permission;
}) {
  const access = await getProjectAccess(prisma, input);
  if (access.status !== "ok") return access;
  const surface = await prisma.translationSurface.findFirst({
    where: { projectId: access.projectId, slug: input.surfaceSlug, archivedAt: null },
  });
  if (!surface) return { status: "not-found" as const };
  return { ...access, surfaceId: surface.id, surface };
}
