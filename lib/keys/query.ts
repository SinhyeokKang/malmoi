import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor, KeyRow } from "./view";

/**
 * 키 리스트 데이터 조회. **`projectId`로 좁힌다** — 인덱스가 전부 `projectId` 선두 복합이고,
 * 더 중요하게는 RLS가 없어 애플리케이션이 유일한 테넌트 방어선이다 (CLAUDE.md). 받는 id는 인가가 준 것이다.
 */

export type LocaleRow = {
  code: string;
  name: string;
  isBase: boolean;
  /** 리포에서 사라진 로케일 — 열은 보이되 편집은 막는다. 저장해도 pull이 그 파일을 내지 않는다 (ARCHITECTURE §5.5.16). */
  orphaned: boolean;
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

/**
 * ⚠️ **slug가 아니라 `projectId`를 받는다** (2026-09-05). 호출부는 `requireProjectAccess`가
 * **멤버십 행에서 꺼낸** id를 갖고 있다 — 그것을 버리고 slug로 다시 찾으면 클라이언트가 준
 * 식별자를 두 번 믿는 것이 되고, "인가가 판정한 projectId로 좁힌다"는 규칙(SAAS §5.2)이
 * 이 화면에서만 깨진다. 왕복도 하나 준다.
 */
export async function loadProject(prisma: PrismaClient, projectId: string): Promise<ProjectContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, slug: true, name: true, repoOwner: true, repoName: true,
      lastCommitSha: true, baseLocale: true,
      locales: { select: { code: true, name: true, isBase: true, orphaned: true }, orderBy: { code: "asc" } },
    },
  });
  return project;
}

/**
 * **전 로케일**의 키 목록. 테이블이 로케일을 열로 펼치므로 한 번에 다 읽는다.
 *
 * 네임스페이스 필터를 SQL로 내리지 않는다 — 사이드바가 전 네임스페이스의 집계를 필요로 하므로
 * 어차피 전체를 읽어야 하고, 두 번 읽는 대신 한 번 읽어 메모리에서 나눈다.
 *
 * ⚠️ **번역을 로케일별로 좁히지 않는다** — 이전엔 `where: { localeCode }`로 1:1이었지만
 * 테이블은 전 로케일이 필요하다. 로케일 6개면 행 수가 6배지만, `Translation`이 키당 최대
 * 로케일 수만큼이라 상한이 명확하다(skillflo 8676행). 로케일별로 6번 쿼리하는 것보다 낫다.
 */
export async function loadKeys(
  prisma: PrismaClient,
  projectId: string,
): Promise<KeyRow[]> {
  const keys = await prisma.stringKey.findMany({
    where: { projectId },
    orderBy: { key: "asc" },
    select: {
      id: true, key: true, namespace: true, description: true, orphaned: true,
      translations: { select: { localeCode: true, value: true, needsReview: true, updatedBy: true } },
      refs: { select: { path: true, line: true }, orderBy: [{ path: "asc" }, { line: "asc" }] },
    },
  });

  return keys.map((k) => {
    const cells: KeyRow["cells"] = {};
    for (const t of k.translations) {
      cells[t.localeCode] = { value: t.value, needsReview: t.needsReview, updatedBy: t.updatedBy };
    }
    return {
      id: k.id,
      key: k.key,
      namespace: k.namespace,
      description: k.description,
      orphaned: k.orphaned,
      cells,
      refs: k.refs,
    };
  });
}

/**
 * 편집자 이름의 출처. **`Translation.updatedBy`를 Prisma join으로 풀 수 없다** — 그 컬럼은 FK가 없고
 * `User.id`와 옛 GitHub 핸들이 섞여 있어(스키마 주석) join하면 옛 행이 통째로 떨어진다. 그래서
 * `collectActorIds`가 모은 id로 **한 번 더** 읽고, 못 찾은 값은 `actorLabel`이 원문으로 낸다.
 *
 * ⚠️ **`projectId`로 좁히지 않는다 — `User`는 프로젝트에 속한 테이블이 아니다** (POSTMORTEM
 * 2026-09-06이 넓힌 규칙). 대신 받는 `ids`가 **인가를 지난 그 프로젝트의 번역 행에서만** 나오므로
 * 여기서 다른 테넌트의 사람이 조회되지 않는다. 호출부가 그 출처를 바꾸면 이 성질이 깨진다.
 */
export async function loadActors(prisma: PrismaClient, ids: string[]): Promise<Map<string, Actor>> {
  // 편집 이력이 없는 프로젝트가 흔하다 — 빈 `in`으로 왕복을 만들지 않는다.
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}
