import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { KeyRow } from "./view";

/**
 * 키 리스트 데이터 조회. **`projectId`로 좁힌다** — 인덱스가 전부 `projectId` 선두 복합이고,
 * 더 중요하게는 인가가 아직 단일 테넌트라 애플리케이션이 유일한 방어선이다 (CLAUDE.md).
 */

export type LocaleRow = {
  code: string;
  name: string;
  isBase: boolean;
};

export type ProjectContext = {
  id: string;
  slug: string;
  name: string;
  repoOwner: string;
  repoName: string;
  lastCommitSha: string | null;
  baseLocale: string | null;
  locales: LocaleRow[];
};

export async function loadProject(prisma: PrismaClient, slug: string): Promise<ProjectContext | null> {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, repoOwner: true, repoName: true,
      lastCommitSha: true, baseLocale: true,
      locales: { select: { code: true, name: true, isBase: true }, orderBy: { code: "asc" } },
    },
  });
  return project;
}

/**
 * 한 로케일 관점의 **전체** 키 목록.
 *
 * 네임스페이스 필터를 SQL로 내리지 않는다 — 사이드바가 전 네임스페이스의 집계를 필요로 하므로
 * 어차피 전체를 읽어야 하고, 두 번 읽는 대신 한 번 읽어 메모리에서 나눈다. 1446행 규모에서
 * 이게 더 단순하고 빠르다 (가상화를 안 넣는 것과 같은 판단 — MVP §5).
 *
 * **번역은 `where`로 좁힌 1:1로 가져온다.** 로케일이 6개인 리포에서 전부 싣고 JS에서 고르면
 * 6배를 읽는다.
 */
export async function loadKeys(
  prisma: PrismaClient,
  projectId: string,
  localeCode: string,
): Promise<KeyRow[]> {
  const keys = await prisma.stringKey.findMany({
    where: { projectId },
    orderBy: { key: "asc" },
    select: {
      id: true, key: true, namespace: true, sourceText: true, description: true, orphaned: true,
      translations: {
        where: { localeCode },
        select: { value: true, needsReview: true, updatedBy: true },
      },
      refs: { select: { path: true, line: true }, orderBy: [{ path: "asc" }, { line: "asc" }] },
    },
  });

  return keys.map((k) => {
    const tr = k.translations[0];
    return {
      id: k.id,
      key: k.key,
      namespace: k.namespace,
      sourceText: k.sourceText,
      description: k.description,
      orphaned: k.orphaned,
      value: tr?.value ?? null,
      needsReview: tr?.needsReview ?? false,
      updatedBy: tr?.updatedBy ?? null,
      refs: k.refs,
    };
  });
}
