import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Subject } from "@/lib/auth/subject";
import { isProjectReady } from "@/lib/projects/ready";
import { getSurfaceAccess } from "@/lib/surfaces/access";
import { parseTranslationQuery } from "@/lib/translations/query";

import { loadTranslationList, type TranslationListRow } from "./translation-list";

// 상한은 주소창 값의 합리적인 크기다 — 검색어(`Q_MAX_LENGTH` 200)·키 id·cursor(키 이름을 든다)를 넉넉히 덮고 그 이상은 조작이다.
export const MoreInput = z.object({
  slug: z.string().min(1).max(200), surfaceSlug: z.string().min(1).max(200),
  query: z.record(z.string().max(64), z.string().max(1024)), cursor: z.string().min(1).max(2048),
});
export type MoreInputType = z.infer<typeof MoreInput>;

export type MoreKeysResult = { ok: true; rows: TranslationListRow[]; nextCursor: string | null } | { ok: false; error: string };

/**
 * **키 목록의 다음 페이지** (audit-ux #19) — 공유 코어. 읽기 전용이다. 조건은 주소와 같은 해석(`parseTranslationQuery`)을 다시 지난다.
 */
export async function loadMoreKeys(prisma: PrismaClient, subject: Subject, input: MoreInputType): Promise<MoreKeysResult> {
  const { slug, surfaceSlug, cursor } = input;
  const access = await getSurfaceAccess(prisma, { userId: subject.userId, slug, surfaceSlug, permission: "translation:write" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  if (!(await isProjectReady(prisma, access.projectId))) return { ok: false, error: "not-ready" };
  // 선택 키·상세 언어는 페이지와 무관하다 — 목록 조건만 남긴다.
  const { key: _key, keySurface: _keySurface, language: _language, ...conditions } = parseTranslationQuery(input.query);
  const page = await loadTranslationList(prisma, { projectId: access.projectId, routeSurfaceId: access.surfaceId, query: { ...conditions, cursor } });
  return { ok: true, rows: page.rows, nextCursor: page.nextCursor };
}
