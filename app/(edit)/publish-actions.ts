"use server";
import { readSession } from "@/lib/auth/read-session";
import { getProjectAccess } from "@/lib/auth/query";
import { getPrisma } from "@/lib/db";
import { readPublishPreview } from "@/lib/publish/read";
import type { PublishPreview } from "@/lib/publish/preview";
import { logFailure } from "@/lib/github-connect/log";

export async function loadPublishPreview(raw: { slug: string }): Promise<PublishPreview | null> {
  if (!raw || typeof raw.slug !== "string" || !raw.slug) return null;
  const session = await readSession();
  if (session.status !== "ok") return null;
  try {
    const prisma = getPrisma();
    const access = await getProjectAccess(prisma, { userId: session.userId, slug: raw.slug, permission: "translation:write" });
    if (access.status !== "ok") return null;
    return await readPublishPreview(prisma, access.projectId, raw.slug);
  } catch (error) { logFailure("publish-preview", error); return null; }
}
