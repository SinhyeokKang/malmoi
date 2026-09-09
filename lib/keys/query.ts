import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
// ⚠️ `Role`은 **생성물이 아니라 도메인 층**에서 온다 — 그 파일이 "Prisma의 `enum Role`과 두 벌인 것은
// 의도"라고 못박아 두고 `canPerform`이 그 union을 든다. 사이드바가 이 값을 그쪽으로 넘긴다.
import type { Role } from "@/lib/auth/permission";
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
  /**
   * readiness 판정의 재료 둘 (`planProjectReadiness`). **번역 화면이 따로 조회하지 않는다** —
   * 같은 행을 두 번 읽던 것을 한 번으로 합쳤다 (T7).
   */
  installationId: string | null;
  lastCommitSha: string | null;
  baseLocale: string | null;
  /**
   * 기준 로케일 변경의 **선언**. 번역 화면의 대기 배너가 `basePending`으로 이것과 `baseLocale`을
   * 견준다 (6b-3 — design §3.13). pull은 이 컬럼을 읽지 않는다.
   */
  declaredBaseLocale: string | null;
  /** 미배포 판정의 기준선. 벽시계가 아니라 캡처된 `max(updatedAt)`이다 (design §3.5). */
  lastPulledAt: Date | null;
  /** 마지막으로 **보낸** 시각과 그때의 PR. `skipped`는 이 둘을 건드리지 않는다 (design §3.4). */
  lastPublishedAt: Date | null;
  lastPrUrl: string | null;
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
      installationId: true, lastCommitSha: true, baseLocale: true, declaredBaseLocale: true,
      lastPulledAt: true, lastPublishedAt: true, lastPrUrl: true,
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
      translations: {
        select: { localeCode: true, value: true, needsReview: true, updatedBy: true, updatedAt: true },
      },
      refs: { select: { path: true, line: true }, orderBy: [{ path: "asc" }, { line: "asc" }] },
    },
  });

  return keys.map((k) => {
    const cells: KeyRow["cells"] = {};
    for (const t of k.translations) {
      cells[t.localeCode] = {
        value: t.value,
        needsReview: t.needsReview,
        updatedBy: t.updatedBy,
        updatedAt: t.updatedAt,
      };
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

/**
 * 아직 안 보낸 편집의 **수**. `isUnpublished`(`./view`)의 집계 형태다 — 술어가 두 벌이 되지 않게
 * 조건을 같은 문장으로 적는다.
 *
 * ⚠️ **`updatedBy: { not: null }`이 빠지면 안 된다.** push가 전 행의 `updatedAt`을 올리므로 그 조건이
 * 없으면 push 직후 야간 pull 전까지 903키 전부가 "안 보낸 편집"으로 나오고, 편집 손실 배너가 매번 뜬다
 * (translation-ui design §3.5). push가 쓴 행은 `updatedBy`를 비운다(§3.6).
 *
 * ⚠️ **`projectId`로 좁힌다** — RLS가 없어 애플리케이션이 유일한 테넌트 방어선이다.
 */
export async function countUnpublished(
  prisma: PrismaClient,
  projectId: string,
  lastPulledAt: Date | null,
): Promise<number> {
  return prisma.translation.count({
    where: {
      projectId,
      updatedBy: { not: null },
      // 한 번도 안 보냈으면 사람이 만진 행이 전부 미배포다 — 비교 대상이 없다.
      ...(lastPulledAt === null ? {} : { updatedAt: { gt: lastPulledAt } }),
    },
  });
}

/**
 * 내 멤버십 한 줄. 셸 사이드바와 프로젝트 목록이 **같은 조회**를 쓴다 — 이름이 같은 함수가 두 벌이면
 * 그중 하나가 낡는다(2026-09-08에 실제로 그렇게 갈릴 뻔했다).
 *
 * `installationId`·`lastCommitSha`는 목록의 상태 텍스트 재료다 — `planProjectReadiness`가 컬럼을
 * 만들지 않고 이 둘로 판정한다 (design §3.7). 사이드바는 그것을 안 읽는다.
 */
export type MembershipRow = {
  slug: string;
  name: string;
  role: Role;
  installationId: string | null;
  lastCommitSha: string | null;
};

/**
 * 내 멤버십 목록 — 셸 레이아웃이 읽는다. **새 조회다**(지금 레이아웃은 Prisma를 안 부른다).
 *
 * ⚠️ **`userId`로 좁힌다.** 2026-09-06에 이 규칙을 어긴 조회가 남의 행을 냈다 — 사용자당 멤버십이
 * 세 개뿐이라 페이지네이션은 없지만, 좁힘이 빠지면 전 테넌트가 사이드바에 뜬다.
 */
export async function loadMemberships(prisma: PrismaClient, userId: string): Promise<MembershipRow[]> {
  const rows = await prisma.projectMember.findMany({
    where: { userId },
    select: {
      role: true,
      project: { select: { slug: true, name: true, installationId: true, lastCommitSha: true } },
    },
    // 결정적 순서 — 목록이 렌더마다 흔들리면 사용자가 항목을 근육 기억으로 못 찾는다.
    orderBy: { project: { slug: "asc" } },
  });
  return rows.map((r) => ({
    slug: r.project.slug,
    name: r.project.name,
    role: r.role,
    installationId: r.project.installationId,
    lastCommitSha: r.project.lastCommitSha,
  }));
}

/**
 * 로케일별 진행률의 재료 (6b-5). **집계는 `localeProgress`가 한다** — 여기는 조회만이다.
 *
 * ⚠️ **`loadKeys`를 재사용하지 않는다.** 그쪽은 행마다 셀과 `refs`를 들고 오므로 903키 프로젝트에서
 * 이 화면이 번역 화면만큼 무거워진다. 여기 필요한 것은 개수뿐이라 **셀에서 `{ localeCode, needsReview }`
 * 둘만** 뽑는다 — `value`를 select하면 번역 본문 전체가 따라온다.
 *
 * ⚠️ **필터 둘이 판정이다.**
 * - `value: { not: "" }` — 빈 값은 미번역이다. 편집 UI에서 값을 지우면 빈 문자열 행이 남는다
 *   (`translationState`와 같은 규칙 — 두 벌이 되면 표의 배지와 이 화면의 숫자가 갈린다).
 * - `stringKey: { orphaned: false }` — 코드에서 사라진 키의 번역은 분자에서 빠져야 한다. 분모도 같은
 *   조건이므로 안 걸면 **분자가 분모보다 커진다.**
 *
 * ⚠️ **둘을 병렬로 보낸다.** 순차로 보내면 도쿄 리전 왕복이 하나 더 붙고, 그 고정 비용이 이미
 * 실측돼 있다 (CLAUDE.md 가상화 절).
 */
export type LocaleCounts = {
  /** 살아 있는 키 수 — 전 로케일 공통 분모다. */
  total: number;
  cells: { localeCode: string; needsReview: boolean }[];
};

export async function loadLocaleCounts(prisma: PrismaClient, projectId: string): Promise<LocaleCounts> {
  const [total, cells] = await Promise.all([
    prisma.stringKey.count({ where: { projectId, orphaned: false } }),
    prisma.translation.findMany({
      where: { projectId, value: { not: "" }, stringKey: { orphaned: false } },
      select: { localeCode: true, needsReview: true },
    }),
  ]);
  return { total, cells };
}
