import { fail } from "@/lib/failure";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { countPending, pendingWhere } from "@/lib/protection/where";
import type { PendingEdit, PullState } from "./run";

/**
 * pull이 필요한 DB 상태를 읽고, 성공 후 `lastPulledAt`을 쓴다.
 *
 * **`lib/db.ts`를 import하지 않는다** — 그 파일의 `server-only` 때문에 스크립트·테스트가 이
 * 모듈을 열 수조차 없어진다 (ARCHITECTURE §5.5.4에서 이미 밟은 함정). 클라이언트는 라우트나
 * Server Action이 주입한다.
 *
 * ⚠️ **모든 쿼리를 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이고, 더 중요하게는
 * RLS가 없어 애플리케이션이 유일한 테넌트 방어선이다 (CLAUDE.md).
 */

export async function loadPullState(prisma: PrismaClient, slug: string): Promise<PullState> {
  return prisma.$transaction((tx) => loadSnapshot(tx, slug), { isolationLevel: "RepeatableRead" });
}

async function loadSnapshot(prisma: Prisma.TransactionClient, slug: string): Promise<PullState> {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      repoOwner: true,
      repoName: true,
      baseBranch: true,
      installationId: true,
      repositoryId: true,
      lastPulledAt: true,
      // ⚠️ **사라진 로케일은 빼고 읽는다.** 안 빼면 개발자가 지운 로케일 파일을 pull이 되살린다 —
      // 행은 DB에 남아 있고 번역도 남아 있으므로 write가 내용을 만들어 커밋에 싣는다 (ARCHITECTURE §0 불변식 2).
      surfaces: { where: { archivedAt: null }, include: {
        locales: { where: { orphaned: false }, select: { code: true }, orderBy: { code: "asc" } },
      } },
    },
  });
  if (!project) fail(`project not found: ${slug}`);

  const { surfaces, ...rest } = project;

  const keys = await prisma.stringKey.findMany({
    where: { projectId: project.id, surfaceId: { in: surfaces.map(s => s.id) } },
    // ⚠️ **가독성·디버깅 목적이다, 결정성의 근거가 아니다.** `orderedEntries`가 동률을 키로 갈라
    // 전순서를 만들므로 DB 순서는 바이트에 영향을 줄 수 없다. 조회 결과와 파일 순서가 눈으로
    // 대응해야 순서 문제를 진단할 수 있어서 맞춰 둔다.
    // ⚠️ `lib/keys/query.ts`에도 같은 `orderBy`가 있는데 **그쪽은 편집 UI 행 순서의 유일한
    //    출처라 절대 바꾸지 않는다.** grep하면 둘 다 잡힌다.
    orderBy: [{ sortIndex: "asc" }, { key: "asc" }],
    select: {
      surfaceId: true,
      key: true,
      sourceText: true,
      description: true,
      sortIndex: true,
      orphaned: true,
      // 로케일별 chrome 필드도 여기서 온다 — `StringKey.description`(키 단위)과 다른 값이다.
      translations: { select: { localeCode: true, value: true, description: true, placeholders: true } },
    },
  });

  // `lastPulledAt`에 캡처될 값. **`projectId`로 좁힌다** — 안 좁히면 다른 프로젝트의 편집이 이 프로젝트의
  // pull을 깨우고, 그쪽 `updatedAt`이 이쪽 `lastPulledAt`에 박힌다.
  const agg = await prisma.translation.aggregate({
    where: { projectId: project.id },
    _max: { updatedAt: true },
  });
  // 1층 판정값 — `countUnpublished`와 같은 토큰 술어다. 시각으로 세면 push가 올린 `updatedAt`이 편집으로 읽히고
  // (T0), 저자·시각으로 세면 같은 밀리초 재저장과 전달 확인을 못 가른다 (sync-edit-protection T8).
  const unpublished = await countPending(prisma, project.id);
  // 전달 확인할 편집 — export와 **같은 스냅샷**에서 읽어야 "PR에 실린 값의 토큰"이 된다 (sync-edit-protection — ARCHITECTURE §5의 `pendingEditToken`).
  // 0이면 조회하지 않는다 — 관계 조인이 낡은 통계에서 인덱스를 버리는 창이 있다(`countPending` 주석). 같은 스냅샷이라 결과가 같다.
  const pending = unpublished === 0 ? [] : await prisma.translation.findMany({ where: pendingWhere(project.id), select: { id: true, pendingEditToken: true } });

  return {
    project: rest,
    surfaces: surfaces.map(surface => ({ ...surface,
    localeCodes: surface.locales.map((l) => l.code),
    keys: keys.filter(k => k.surfaceId === surface.id).map((k) => ({
      key: k.key,
      sourceText: k.sourceText,
      description: k.description,
      sortIndex: k.sortIndex,
      orphaned: k.orphaned,
      // 로케일 코드 → 셀. 행이 없는 로케일은 미번역이라 키 자체가 없어야 한다
      // (`undefined`와 `{ value: "" }`가 base 폴백에서 갈린다).
      cells: Object.fromEntries(
        k.translations.map((t) => [
          t.localeCode,
          {
            value: t.value,
            ...(t.description === null ? {} : { description: t.description }),
            // Prisma의 Json 컬럼은 비어 있으면 `null`을 준다 — 없는 것과 같게 다룬다.
            ...(t.placeholders === null ? {} : { placeholders: t.placeholders }),
          },
        ]),
      ),
    })),
    })),
    maxUpdatedAt: agg._max.updatedAt,
    unpublished,
    pendingEdits: pending.flatMap(t => t.pendingEditToken === null ? [] : [{ id: t.id, token: t.pendingEditToken }]),
  };
}

/**
 * 2층까지 통과했을 때의 갱신. **`published`가 있으면 같은 `update`에 함께 실린다** — 왕복을 두 번
 * 만들지 않는다.
 *
 * ⚠️ **`skipped`는 `lastPublishedAt`을 건드리지 않는다** — 그 컬럼은 "마지막으로 **보낸**" 시각이지
 * "마지막으로 시도한" 시각이 아니다 (ARCHITECTURE §3). 반대로 `lastPulledAt`은 변경 없는
 * 스킵에도 전진한다(그 순간 export == base 트리가 검증된 상태다).
 *
 * 시각은 **여기서** 잰다 — `lastPulledAt`에 들어가는 캡처 값(`max(updatedAt)`)은 벽시계가 아니라
 * 그 둘이 같은 값이면 안 된다.
 */
export async function saveLastPulledAt(
  prisma: PrismaClient,
  projectId: string,
  at: Date,
  published: { prUrl: string } | undefined,
  delivered: readonly PendingEdit[],
): Promise<void> {
  const project = {
    where: { id: projectId },
    data: {
      lastPulledAt: at,
      ...(published === undefined ? {} : { lastPublishedAt: new Date(), lastPrUrl: published.prUrl }),
    },
  };
  if (delivered.length === 0) {
    await prisma.project.update(project);
    return;
  }
  // 같은 트랜잭션이다 — `lastPulledAt`만 전진하고 해제가 빠지면 옛 술어는 0인데 토큰이 남는 "유령 pending"이 된다
  // (ARCHITECTURE §3). 두 쓰기를 `Promise.all`로 겹치지 않는다(POSTMORTEM 2026-09-16).
  await prisma.$transaction(async (tx) => {
    await tx.project.update(project);
    await acknowledgeDelivered(tx, projectId, delivered);
  });
}

/**
 * **캡처한 토큰이 아직 그대로인 셀만** 해제한다 — 캡처 뒤 같은 셀을 다시 저장했으면 토큰이 달라 남는다(같은 밀리초여도).
 *
 * ⚠️ **선조회 후 무조건 UPDATE로 바꾸지 않는다** — 이 조건부 UPDATE 한 문장이 방어선이다 (ARCHITECTURE §3).
 * ⚠️ `updatedAt`을 건드리지 않는다 — raw SQL이라 `@updatedAt`이 개입하지 않는다. 시각이 움직이면 방금 쓴
 * `lastPulledAt`(= 캡처한 `max(updatedAt)`)보다 뒤가 되어 옛 술어가 전달한 편집을 다시 센다.
 * ⚠️ orphan 키·로케일·보관 표면 셀은 캡처 뒤 그렇게 됐어도 여기서 바꾸지 않는다 (완료 조건 9).
 */
async function acknowledgeDelivered(tx: Prisma.TransactionClient, projectId: string, delivered: readonly PendingEdit[]): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Translation" AS t SET "pendingEditToken" = NULL
    FROM unnest(${delivered.map(d => d.id)}::text[], ${delivered.map(d => d.token)}::text[]) AS v("id", "token"),
      "TranslationSurface" s, "StringKey" k, "Locale" l
    WHERE t."projectId" = ${projectId}
      AND t."id" = v."id" AND t."pendingEditToken" = v."token"
      AND s."projectId" = t."projectId" AND s."id" = t."surfaceId" AND s."archivedAt" IS NULL
      AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId" AND k."orphaned" = false
      AND l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode" AND l."orphaned" = false`;
}
