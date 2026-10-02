import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { KeyHit } from "@/lib/search/key-href";
import { Q_MAX_LENGTH } from "@/lib/translations/query";
import { likePattern } from "./translation-list";

export function keySearchQuery(q: string): { pattern: string } | null {
  const query = q.trim().slice(0, Q_MAX_LENGTH);
  return query.length < 2 ? null : { pattern: likePattern(query) };
}

/** UTF-8 COLLATE C order is code-point order, including supplementary characters. */
function compareC(a: string, b: string): number {
  const left = Array.from(a, char => char.codePointAt(0) ?? 0);
  const right = Array.from(b, char => char.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function mergeKeyHits(first: readonly KeyHit[], second: readonly KeyHit[], activeSlug: string | null): KeyHit[] {
  const order = (a: KeyHit, b: KeyHit) => Number(b.slug === activeSlug) - Number(a.slug === activeSlug) || compareC(a.key, b.key) || compareC(a.id, b.id);
  const seen = new Set<string>();
  const unique = (rows: readonly KeyHit[]) => rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  const primary = unique([...first].sort((a, b) => Number(b.inKey) - Number(a.inKey) || order(a, b))).slice(0, 5);
  if (primary.length === 5) return primary;
  return [...primary, ...unique([...second].sort(order)).slice(0, 5 - primary.length)];
}

/**
 * 읽기 인가는 lib/auth/access.ts와 같은 멤버십·보관 판정이다. installationId는 null로 되돌리는
 * 경로가 없으므로 준비 여부는 표면의 첫 적재로 좁힌다. activeSlug는 순위에만 쓰인다.
 */
export async function searchKeys(prisma: PrismaClient, { userId, q, activeSlug }: {
  userId: string; q: string; activeSlug: string | null;
}): Promise<KeyHit[]> {
  const query = keySearchQuery(q);
  if (query === null) return [];
  const { pattern } = query;
  // 배열 InitPlan이 먼저 멤버 id를 확정해야 통계가 없어도 Translation 전 테넌트 해시 조인을 피한다.
  const members = Prisma.sql`ARRAY(SELECT p.id FROM "ProjectMember" pm JOIN "Project" p ON p.id = pm."projectId"
    WHERE pm."userId" = ${userId} AND p."archivedAt" IS NULL)`;
  const first = await prisma.$queryRaw<KeyHit[]>(Prisma.sql`
    SELECT k.id, k.key, k.namespace, k."sourceText", s.slug AS "surfaceSlug", p.slug, p.name,
      (k.key ILIKE ${pattern}) AS "inKey", NULL::text AS "localeCode", NULL::text AS value
    FROM "StringKey" k
    JOIN "Project" p ON p.id = k."projectId"
    JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s.id = k."surfaceId"
      AND s."archivedAt" IS NULL AND s."lastCommitSha" IS NOT NULL
    WHERE k."projectId" = ANY(${members}) AND NOT k.orphaned
      AND (k.key ILIKE ${pattern} OR k."sourceText" ILIKE ${pattern})
    ORDER BY "inKey" DESC, (p.slug = ${activeSlug}) DESC, k.key COLLATE "C", k.id COLLATE "C"
    LIMIT 5`);
  if (first.length === 5) return first;
  const excluded = first.map(hit => hit.id);
  // ANY 배열은 ANALYZE 뒤에도 원소 수를 몰라 전 테넌트 스캔을 고를 수 있다. 멤버별 LATERAL의
  // OFFSET 0이 projectId 동등 인덱스 탐색을 고정한다. IS TRUE는 로케일 검사를 해시 SubPlan으로
  // 남겨 통계 없는 다중 조인이 셀을 키마다 재탐색하지 못하게 한다. 집계 뒤에만 키 메타데이터를 붙인다.
  // matched 경계도 필요하다. 합치면 통계 없는 집계가 전체 셀 정렬로 돌아간다(B3 실측).
  // (keyId, localeCode)가 유일하므로 C 정렬 배열의 최솟값은 첫 로케일과 그 값 한 쌍이다.
  const second = await prisma.$queryRaw<KeyHit[]>(Prisma.sql`
    WITH matched AS MATERIALIZED (
      SELECT t.* FROM unnest(${members}) member(id)
      CROSS JOIN LATERAL (
        SELECT t."projectId", t."surfaceId", t."keyId", t."localeCode", t.value
        FROM "Translation" t WHERE t."projectId" = member.id OFFSET 0
      ) t
      WHERE t.value ILIKE ${pattern} AND t."keyId" <> ALL(${excluded}::text[])
        AND ((t."projectId", t."surfaceId", t."localeCode") IN (
          SELECT l."projectId", l."surfaceId", l.code FROM "Locale" l
          WHERE l."projectId" = ANY(${members}) AND NOT l.orphaned
        )) IS TRUE
    ), first_match AS MATERIALIZED (
      SELECT t."projectId", t."surfaceId", t."keyId", min(ARRAY[t."localeCode", t.value] COLLATE "C") AS cell
      FROM matched t
      GROUP BY t."projectId", t."surfaceId", t."keyId"
    )
    SELECT k.id, k.key, k.namespace, k."sourceText", s.slug AS "surfaceSlug", p.slug, p.name,
      false AS "inKey", t.cell[1] AS "localeCode", t.cell[2] AS value
    FROM first_match t
    JOIN LATERAL (
      SELECT k.* FROM "StringKey" k WHERE k.id = t."keyId" AND NOT k.orphaned OFFSET 0
    ) k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId"
    JOIN "Project" p ON p.id = k."projectId"
    JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s.id = k."surfaceId"
      AND s."archivedAt" IS NULL AND s."lastCommitSha" IS NOT NULL
    ORDER BY (p.slug = ${activeSlug}) DESC, k.key COLLATE "C", k.id COLLATE "C"
    LIMIT ${5 - first.length}`);
  return mergeKeyHits(first, second, activeSlug);
}
