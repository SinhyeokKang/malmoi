import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { actorLabel } from "@/lib/keys/view";
import { effectiveCompletion, type EffectiveCompletion } from "@/lib/translations/summary";
import { ALL_NAMESPACES, DEFAULT_TRANSLATION_QUERY, translationsHref, type TranslationQuery } from "@/lib/translations/query";

/**
 * **번역 화면의 조회 셋** (translation-rework T9 — design §2 · §10.2). 트리 · 요약 목록 · 선택 키 상세.
 *
 * ⚠️ **목록에 전 키의 번역값을 싣지 않는다** — 요약(결측 수·review·pending)만 내고, 값은 선택한 키 하나의 상세가 읽는다.
 * ⚠️ **집계 규칙의 정본은 `lib/translations/summary.ts`의 oracle이다** — `translation-list.integration.ts`가 같은 fixture에서
 *    둘을 대조한다. 분모 = 그 소스의 활성 로케일, 결측 = 행 부재/빈 값, review는 값이 있을 때만, pending은 `pendingWhere`와 같은 셀.
 * ⚠️ **모든 조회를 인가된 `projectId`로 좁히고, 표면은 그 프로젝트의 활성 표면 안에서만 고른다** (불변식 5).
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 직접 부른다. 사람 이름은 `loadActors`를 호출부가 넘긴다.
 */
export const PAGE_SIZE = 100;
/** `sortIndex`가 없는 키는 파일 순서 뒤로 — 행 비교(keyset)가 NULL을 다루지 않게 큰 값으로 채운다. */
const NO_SORT = 2_147_483_647;

export type TranslationTree = {
  projectKeyCount: number;
  surfaces: { id: string; slug: string; baseLocale: string | null; locales: string[]; keyCount: number; namespaces: { name: string; keyCount: number }[] }[];
};

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function loadTranslationTree(prisma: PrismaClient, projectId: string): Promise<TranslationTree> {
  const surfaces = await prisma.translationSurface.findMany({
    where: { projectId, archivedAt: null },
    select: { id: true, slug: true, baseLocale: true, locales: { where: { orphaned: false }, select: { code: true } } },
  });
  const counts = surfaces.length === 0 ? [] : await prisma.stringKey.groupBy({
    by: ["surfaceId", "namespace"],
    where: { projectId, orphaned: false, surfaceId: { in: surfaces.map(s => s.id) } },
    _count: { _all: true },
  });
  const shaped = surfaces.map(surface => {
    const namespaces = counts.filter(c => c.surfaceId === surface.id)
      .map(c => ({ name: c.namespace, keyCount: c._count._all }))
      .sort((a, b) => byCodeUnit(a.name, b.name));
    return {
      id: surface.id, slug: surface.slug, baseLocale: surface.baseLocale,
      locales: surface.locales.map(l => l.code).sort(byCodeUnit),
      keyCount: namespaces.reduce((sum, ns) => sum + ns.keyCount, 0),
      namespaces,
    };
  }).sort((a, b) => byCodeUnit(a.slug, b.slug));
  return { projectKeyCount: shaped.reduce((sum, s) => sum + s.keyCount, 0), surfaces: shaped };
}

export type TranslationMatch = { field: "key" | "source" | "translation"; localeCode?: string; text: string; start: number; length: number };

export type TranslationListRow = {
  keyId: string;
  surfaceSlug: string;
  namespace: string;
  key: string;
  sourceText: string;
  missingCount: number;
  totalLocales: number;
  hasPending: boolean;
  hasReview: boolean;
  isNew: boolean;
  match?: TranslationMatch;
};

export type TranslationList = {
  rows: TranslationListRow[];
  matchedKeyCount: number;
  incompleteKeyCount: number;
  nextCursor: string | null;
  effective: EffectiveCompletion;
  /** 선택 키가 이 조건의 결과(첫 페이지 밖 포함)에 있는가. 선택이 없으면 `null`. 필터·검색 뒤 상세를 비울지의 근거다. */
  selectedInResult: boolean | null;
};

type Cursor = [rank: number, surfaceSlug: string, sortIndex: number, key: string, id: string];

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** 모양이 맞지 않는 cursor는 **첫 페이지**다 — 조작된 값으로 범위를 넓히거나 오류를 내지 않는다. */
function decodeCursor(raw: string | undefined): Cursor | null {
  if (raw === undefined) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 5) return null;
    const [rank, slug, sort, key, id] = value as unknown[];
    if ((rank !== 0 && rank !== 1) || typeof slug !== "string" || typeof sort !== "number" || !Number.isInteger(sort) || typeof key !== "string" || typeof id !== "string") return null;
    return [rank, slug, sort, key, id];
  } catch {
    return null;
  }
}

/** LIKE 메타문자를 문자 그대로 — `%`·`_`·`\`. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
}

type Row = {
  id: string; surfaceSlug: string; namespace: string; key: string; sourceText: string; createdAt: Date; sidx: number;
  total: number; missing: number; review: boolean; pending: boolean; rank: number;
};

export async function loadTranslationList(
  prisma: PrismaClient,
  input: { projectId: string; routeSurfaceId: string; query: TranslationQuery; pageSize?: number; selectedKeyId?: string },
): Promise<TranslationList> {
  const { projectId, routeSurfaceId, query } = input;
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { lastPulledAt: true } });
  const scope = await prisma.translationSurface.findMany({
    where: { projectId, archivedAt: null, ...(query.scope === "project" ? {} : { id: routeSurfaceId }) },
    select: { id: true, locales: { where: { orphaned: false }, select: { code: true } } },
  });
  const effective = effectiveCompletion(query, scope.map(s => ({ surfaceId: s.id, locales: s.locales.map(l => l.code) })));
  const surfaceIds = scope.map(s => s.id).filter(id => !effective.excludedSurfaceIds.includes(id));
  const selected = input.selectedKeyId ?? null;
  if (surfaceIds.length === 0) return { rows: [], matchedKeyCount: 0, incompleteKeyCount: 0, nextCursor: null, effective, selectedInResult: selected === null ? null : false };

  const pattern = query.q === undefined ? null : likePattern(query.q);
  const missingLocale = effective.completion === "missing" ? effective.missingLocale ?? null : null;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`k."projectId" = ${projectId}`,
    Prisma.sql`NOT k."orphaned"`,
    Prisma.sql`k."surfaceId" = ANY(${surfaceIds}::text[])`,
  ];
  // `*`는 어댑터가 만들 수 없는 이름이다 — 네임스페이스 범위인데 전체를 가리키면 소스 전체다(0건으로 떨어지지 않는다).
  if (query.scope === "namespace" && query.ns !== ALL_NAMESPACES) conditions.push(Prisma.sql`k."namespace" = ${query.ns}`);
  if (pattern !== null) {
    // 설명은 검색 대상이 아니다(spec §7). 번역값은 **활성 로케일**의 저장값만 본다.
    conditions.push(Prisma.sql`(k."key" ILIKE ${pattern} ESCAPE '\\' OR k."sourceText" ILIKE ${pattern} ESCAPE '\\' OR COALESCE(cells."matchesTranslation", false))`);
  }

  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (effective.completion === "incomplete") filters.push(Prisma.sql`"missing" > 0`);
  if (effective.completion === "complete") filters.push(Prisma.sql`"missing" = 0`);
  if (missingLocale !== null) filters.push(Prisma.sql`NOT "hasLocale"`);
  if (query.state === "unsent") filters.push(Prisma.sql`"pending"`);
  if (query.state === "review") filters.push(Prisma.sql`"review"`);
  // lastPulledAt이 없으면 활성 키 전체가 신규다 — 승인된 정의 (`StringKey.createdAt` 주석).
  if (query.state === "new") filters.push(project.lastPulledAt === null ? Prisma.sql`TRUE` : Prisma.sql`"createdAt" > ${project.lastPulledAt}`);

  /**
   * ⚠️ **키 단위로 먼저 집계한다** — KeyRef를 조인하지 않고, 번역 집계를 MATERIALIZED로 한 번 확정한다. 통계가 낡아도 표면 전체 셀을 키마다 다시 훑지 않는다.
   * ⚠️ **정렬은 `COLLATE "C"`다** — DB 로캘에 따라 키 순서가 갈리면 cursor 비교와 oracle이 어긋난다.
   */
  const filtered = Prisma.sql`
    WITH lc AS MATERIALIZED (
      SELECT "surfaceId", count(*)::int AS n FROM "Locale"
      WHERE "projectId" = ${projectId} AND NOT "orphaned" AND "surfaceId" = ANY(${surfaceIds}::text[]) GROUP BY 1
    ), cells AS MATERIALIZED (
      SELECT t."keyId", count(*) FILTER (WHERE t."value" <> '')::int AS filled,
        bool_or(t."needsReview" AND t."value" <> '') AS "review",
        bool_or(t."pendingEditToken" IS NOT NULL) AS "pending",
        bool_or(t."localeCode" = ${missingLocale} AND t."value" <> '') AS "hasLocale",
        ${pattern === null ? Prisma.sql`false` : Prisma.sql`bool_or(t."value" ILIKE ${pattern} ESCAPE '\\')`} AS "matchesTranslation"
      FROM "Translation" t
      WHERE t."projectId" = ${projectId} AND t."surfaceId" = ANY(${surfaceIds}::text[])
        AND EXISTS (SELECT 1 FROM "Locale" l WHERE l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode" AND NOT l."orphaned")
      GROUP BY t."keyId"
    ), ks AS (
      SELECT k."id", s."slug" AS "surfaceSlug", k."namespace", k."key", k."sourceText", k."createdAt",
        COALESCE(k."sortIndex", ${NO_SORT})::int AS "sidx", lc.n AS "total",
        (lc.n - COALESCE(cells.filled, 0))::int AS "missing",
        COALESCE(cells."review", false) AS "review", COALESCE(cells."pending", false) AS "pending",
        COALESCE(cells."hasLocale", false) AS "hasLocale"
      FROM "StringKey" k
      JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s."id" = k."surfaceId" AND s."archivedAt" IS NULL
      JOIN lc ON lc."surfaceId" = k."surfaceId"
      LEFT JOIN cells ON cells."keyId" = k."id"
      WHERE ${Prisma.join(conditions, " AND ")}
    ), f AS (
      SELECT *, CASE WHEN "missing" > 0 OR "review" THEN 0 ELSE 1 END AS "rank" FROM ks WHERE ${Prisma.join(filters, " AND ")}
    )`;

  const [counts] = await prisma.$queryRaw<{ matched: number; incomplete: number; selected: boolean | null }[]>`
    ${filtered} SELECT count(*)::int AS "matched", (count(*) FILTER (WHERE "missing" > 0))::int AS "incomplete",
      CASE WHEN ${selected}::text IS NULL THEN NULL ELSE bool_or("id" = ${selected}) END AS "selected" FROM f`;
  const cursor = decodeCursor(query.cursor);
  const after = cursor === null ? Prisma.sql`TRUE` : Prisma.sql`("rank", "surfaceSlug" COLLATE "C", "sidx", "key" COLLATE "C", "id" COLLATE "C")
    > (${cursor[0]}::int, ${cursor[1]} COLLATE "C", ${cursor[2]}::int, ${cursor[3]} COLLATE "C", ${cursor[4]} COLLATE "C")`;
  const page = await prisma.$queryRaw<Row[]>`
    ${filtered} SELECT * FROM f WHERE ${after}
    ORDER BY "rank", "surfaceSlug" COLLATE "C", "sidx", "key" COLLATE "C", "id" COLLATE "C" LIMIT ${pageSize + 1}`;

  const visible = page.slice(0, pageSize);
  const last = visible.at(-1);
  const matches = query.q === undefined ? new Map<string, TranslationMatch>() : await matchesFor(prisma, projectId, visible, query.q, pattern ?? "");
  return {
    rows: visible.map(row => ({
      keyId: row.id, surfaceSlug: row.surfaceSlug, namespace: row.namespace, key: row.key, sourceText: row.sourceText,
      missingCount: row.missing, totalLocales: row.total, hasPending: row.pending, hasReview: row.review,
      isNew: project.lastPulledAt === null || row.createdAt.getTime() > project.lastPulledAt.getTime(),
      ...(matches.has(row.id) ? { match: matches.get(row.id) } : {}),
    })),
    matchedKeyCount: counts?.matched ?? 0,
    incompleteKeyCount: counts?.incomplete ?? 0,
    nextCursor: page.length > pageSize && last !== undefined ? encodeCursor([last.rank, last.surfaceSlug, last.sidx, last.key, last.id]) : null,
    effective,
    // 결과가 0행이면 bool_or가 NULL이다 — 선택이 있었으면 "없다"로 읽는다.
    selectedInResult: selected === null ? null : counts?.selected === true,
  };
}

/** 일치 조각 — 키 이름 → 원문 → 활성 로케일 번역(코드순 첫 것). 텍스트와 범위만 주고 HTML을 만들지 않는다. */
async function matchesFor(prisma: PrismaClient, projectId: string, rows: readonly Row[], q: string, pattern: string): Promise<Map<string, TranslationMatch>> {
  const out = new Map<string, TranslationMatch>();
  const needle = q.toLowerCase();
  const find = (text: string) => text.toLowerCase().indexOf(needle);
  const rest: string[] = [];
  for (const row of rows) {
    const inKey = find(row.key);
    if (inKey >= 0) { out.set(row.id, { field: "key", text: row.key, start: inKey, length: q.length }); continue; }
    const inSource = find(row.sourceText);
    if (inSource >= 0) { out.set(row.id, { field: "source", text: row.sourceText, start: inSource, length: q.length }); continue; }
    rest.push(row.id);
  }
  if (rest.length === 0) return out;
  const cells = await prisma.$queryRaw<{ keyId: string; localeCode: string; value: string }[]>`
    SELECT t."keyId", t."localeCode", t."value" FROM "Translation" t
    JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode" AND NOT l."orphaned"
    WHERE t."projectId" = ${projectId} AND t."keyId" = ANY(${rest}::text[]) AND t."value" ILIKE ${pattern} ESCAPE '\\'
    ORDER BY t."keyId", t."localeCode" COLLATE "C"`;
  for (const cell of cells) {
    if (out.has(cell.keyId)) continue;
    const start = find(cell.value);
    // DB의 대소문자 접기와 JS의 것이 다른 드문 문자면 범위를 모른다 — 틀린 강조보다 강조 없음이 낫다.
    if (start >= 0) out.set(cell.keyId, { field: "translation", localeCode: cell.localeCode, text: cell.value, start, length: q.length });
  }
  return out;
}

export type TranslationDetail =
  | {
      status: "ok";
      key: { id: string; key: string; namespace: string; sourceText: string; description: string | null; surfaceSlug: string };
      lastCommitSha: string | null;
      refs: { path: string; line: number }[];
      locales: { code: string; isBase: boolean; value: string | null; needsReview: boolean; pending: boolean; updatedBy: string | null; updatedAt: Date | null }[];
    }
  | { status: "absent" };

/**
 * 선택 키 하나 × 그 소스의 활성 로케일. **base 우선 · 나머지 코드순**. pending은 boolean 투영만 낸다 — 토큰 원문은 서버 밖으로 나가지 않는다.
 * ⚠️ `updatedBy`는 원문 id다 — 화면에 내기 전에 `withActorLabels`로 마스킹된 라벨로 바꾼다.
 */
export async function loadTranslationDetail(prisma: PrismaClient, input: { projectId: string; surfaceId: string; keyId: string }): Promise<TranslationDetail> {
  const { projectId, surfaceId, keyId } = input;
  const key = await prisma.stringKey.findFirst({
    where: { id: keyId, projectId, surfaceId, orphaned: false, surface: { archivedAt: null } },
    select: {
      id: true, key: true, namespace: true, sourceText: true, description: true,
      surface: { select: { slug: true, baseLocale: true, lastCommitSha: true } },
      refs: { select: { path: true, line: true }, orderBy: [{ path: "asc" }, { line: "asc" }] },
      translations: { select: { localeCode: true, value: true, needsReview: true, pendingEditToken: true, updatedBy: true, updatedAt: true } },
    },
  });
  if (key === null) return { status: "absent" };
  const locales = await prisma.locale.findMany({ where: { projectId, surfaceId, orphaned: false }, select: { code: true } });
  const base = key.surface.baseLocale;
  const cellOf = new Map(key.translations.map(t => [t.localeCode, t]));
  const codes = locales.map(l => l.code).sort((a, b) => (a === base ? -1 : b === base ? 1 : byCodeUnit(a, b)));
  return {
    status: "ok",
    key: { id: key.id, key: key.key, namespace: key.namespace, sourceText: key.sourceText, description: key.description, surfaceSlug: key.surface.slug },
    lastCommitSha: key.surface.lastCommitSha,
    refs: key.refs,
    locales: codes.map(code => {
      const cell = cellOf.get(code);
      return {
        code, isBase: code === base, value: cell?.value ?? null, needsReview: cell?.needsReview ?? false,
        pending: (cell?.pendingEditToken ?? null) !== null, updatedBy: cell?.updatedBy ?? null, updatedAt: cell?.updatedAt ?? null,
      };
    }),
  };
}

/** 상세의 저자 id를 **마스킹 라벨**로 바꾼다 — 원문 id·이메일을 화면에 싣지 않는다(`actorLabel`). */
export function withActorLabels(
  detail: Extract<TranslationDetail, { status: "ok" }>,
  actors: Parameters<typeof actorLabel>[1],
) {
  return { ...detail, locales: detail.locales.map(({ updatedBy, ...rest }) => ({ ...rest, actorLabel: actorLabel(updatedBy, actors) })) };
}

/** Logs의 옛 사건은 keyId 대신 키 이름을 든다 — 인가된 프로젝트·소스 slug·이름으로 **현재** id를 찾는다. 없으면 부재 안내다. */
export async function resolveKeyIdByName(prisma: PrismaClient, input: { projectId: string; surfaceSlug: string; key: string }): Promise<string | null> {
  return (await findKeyByName(prisma, input))?.id ?? null;
}

async function findKeyByName(prisma: PrismaClient, input: { projectId: string; surfaceSlug: string; key: string }) {
  return prisma.stringKey.findFirst({
    where: { projectId: input.projectId, key: input.key, orphaned: false, surface: { slug: input.surfaceSlug, archivedAt: null } },
    select: { id: true, namespace: true },
  });
}

/** Logs 상세의 `Open this translation` — 그 키의 네임스페이스에 선택된 채로 착지한다. 키가 없으면 링크를 그리지 않는다(`null`). */
export async function translationLinkFor(prisma: PrismaClient, input: { projectId: string; slug: string; surfaceSlug: string; key: string }): Promise<string | null> {
  const row = await findKeyByName(prisma, input);
  if (row === null) return null;
  return translationsHref(input.slug, input.surfaceSlug, { ...DEFAULT_TRANSLATION_QUERY, ns: row.namespace, scope: "namespace", key: row.id, keySurface: input.surfaceSlug });
}
