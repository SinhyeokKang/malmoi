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

export async function getSurfaceAccess(prisma: PrismaClient, input: {
  slug: string; surfaceSlug: string; userId: string; permission: Permission;
}) {
  const access = await getProjectAccess(prisma, input);
  if (access.status !== "ok") return access;
  const surface = await prisma.translationSurface.findFirst({
    where: { projectId: access.projectId, slug: input.surfaceSlug, archivedAt: null },
  });
  if (!surface) notFound();
  return { ...access, surfaceId: surface.id, surface };
}
