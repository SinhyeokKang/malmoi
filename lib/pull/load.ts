import type { PrismaClient } from "@/generated/prisma/client";
import type { PullState } from "./run";

/**
 * pull이 필요한 DB 상태를 읽고, 성공 후 `lastPulledAt`을 쓴다.
 *
 * **`lib/db.ts`를 import하지 않는다** — 그 파일의 `server-only` 때문에 스크립트·테스트가 이
 * 모듈을 열 수조차 없어진다 (ARCHITECTURE §5.5.4에서 이미 밟은 함정). 클라이언트는 라우트나
 * Server Action이 주입한다.
 *
 * ⚠️ **모든 쿼리를 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이고, 더 중요하게는
 * 인가가 아직 단일 테넌트라 애플리케이션이 유일한 방어선이다 (CLAUDE.md).
 */

export async function loadPullState(prisma: PrismaClient, slug: string): Promise<PullState> {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      repoOwner: true,
      repoName: true,
      baseBranch: true,
      installationId: true,
      adapterName: true,
      pathTemplate: true,
      nested: true,
      baseLocale: true,
      lastPulledAt: true,
      locales: { select: { code: true }, orderBy: { code: "asc" } },
    },
  });
  if (!project) throw new Error(`프로젝트를 찾을 수 없다: ${slug}`);

  const { locales, ...rest } = project;

  const keys = await prisma.stringKey.findMany({
    where: { projectId: project.id },
    orderBy: { key: "asc" },
    select: {
      key: true,
      sourceText: true,
      description: true,
      orphaned: true,
      translations: { select: { localeCode: true, value: true } },
    },
  });

  // 1층 판정의 기준값. **`projectId`로 좁힌다** — 안 좁히면 다른 프로젝트의 편집이 이 프로젝트의
  // pull을 깨우고, 그쪽 `updatedAt`이 이쪽 `lastPulledAt`에 박힌다.
  const agg = await prisma.translation.aggregate({
    where: { projectId: project.id },
    _max: { updatedAt: true },
  });

  return {
    project: rest,
    localeCodes: locales.map((l) => l.code),
    keys: keys.map((k) => ({
      key: k.key,
      sourceText: k.sourceText,
      description: k.description,
      orphaned: k.orphaned,
      // 로케일 코드 → 셀. 행이 없는 로케일은 미번역이라 키 자체가 없어야 한다
      // (`undefined`와 `{ value: "" }`가 base 폴백에서 갈린다).
      cells: Object.fromEntries(k.translations.map((t) => [t.localeCode, { value: t.value }])),
    })),
    maxUpdatedAt: agg._max.updatedAt,
  };
}

export async function saveLastPulledAt(
  prisma: PrismaClient,
  projectId: string,
  at: Date,
): Promise<void> {
  await prisma.project.update({ where: { id: projectId }, data: { lastPulledAt: at } });
}
