import { decodeUser, readable } from "@/lib/credentials/records";
import { validatePiiReadKeys } from "@/lib/credentials/storage";
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
// ⚠️ `Role`은 **생성물이 아니라 도메인 층**에서 온다 — 그 파일이 "Prisma의 `enum Role`과 두 벌인 것은
// 의도"라고 못박아 두고 `canPerform`이 그 union을 든다. 사이드바가 이 값을 그쪽으로 넘긴다.
import type { Role } from "@/lib/auth/permission";
import { isImportFailureCode } from "@/lib/projects/import-status";
import { loadRemoteSignals } from "@/lib/projects/remote";
import {
  rowLocaleProgress,
  summaryQueue,
  type LiveLocale,
  type LocaleCellCount,
  type ProjectEvents,
  type RowLocaleProgress,
  type SummaryQueue,
} from "@/lib/projects/list";
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
 * 식별자를 두 번 믿는 것이 되고, "인가가 판정한 projectId로 좁힌다"는 규칙(ARCHITECTURE §6.00 ③)이
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
    select: { id: true, name: true, email: true, emailLookup: true },
  });
  /**
   * ⚠️ **못 읽은 행은 map에서 빠진다** — `actorLabel`이 그때 `updatedBy` 원문을 내므로 셀이 비지
   * 않는다(그 폴백은 옛 GitHub 핸들을 위해 이미 있다). 던지면 번역 화면 전체가 죽고, 그건
   * 편집 이력 한 줄이 못 읽힌 대가로 너무 크다.
   *
   * ⚠️ 키 부재는 **먼저** 걸러 장애로 남긴다 — 행마다 삼키면 "편집자 이름이 원래 없구나"가 된다.
   */
  validatePiiReadKeys();
  const decoded = users.map((u) => readable(() => decodeUser(u))).filter((u) => u !== null);
  return new Map(decoded.map((u) => [u.id, u]));
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
  /**
   * 보관 시각 (7단계). **목록에서 숨기는 대신 배지로 남긴다** — 숨기면 OWNER가 되돌릴 링크에
   * 도달할 길이 없어지고, 그건 보관을 편도로 만든다 (sync-runs design §4).
   */
  archivedAt: Date | null;
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
      project: {
        select: { slug: true, name: true, installationId: true, lastCommitSha: true, archivedAt: true },
      },
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
    archivedAt: r.project.archivedAt,
  }));
}

/**
 * 목록 화면의 한 행 (8-3 · projects-list §3). `MembershipRow`에 **그 화면만 쓰는 것들**이 붙는다.
 *
 * ⚠️ **`Project.id`를 싣지 않는다** — 화면이 아는 식별자는 slug 하나로 남긴다. 내부 id는 집계를
 * 묶는 서버 안의 값이고, 그것을 RSC 페이로드에 흘리면 URL이 아닌 경로로 새는 식별자가 하나 는다.
 */
export type ProjectListRow = MembershipRow & {
  repoOwner: string;
  repoName: string;
  /** ⚠️ **상태 배지의 셋째 축이다** — null이면 Publish가 거부된다 (`projectStatus`, PRODUCT §7.5). */
  repositoryId: string | null;
  memberCount: number;
  /** `repo_ahead` 띠의 compare 링크와 문구가 쓴다 — **`main`을 하드코딩하지 않는다**. */
  baseBranch: string;
  /** `pr_open` 띠의 목적지. 번호는 여기서 파싱한다. */
  lastPrUrl: string | null;
  /** 행의 Meter — **정렬 후 최대 셋**이다 (design §3.1). */
  meters: RowLocaleProgress[];
  /** 띠·그룹 판정의 입력. GitHub 조회가 실패하면 원격 둘이 "없음"으로 온다. */
  events: ProjectEvents;
};

/** 목록 한 화면분. **Summary는 검색 전 전체 멤버십의 값**이라 행 배열과 함께 온다. */
export type ProjectListView = { rows: ProjectListRow[]; summary: SummaryQueue };

/**
 * `/projects` 목록 전용 조회 (8-3 · projects-list §3).
 *
 * ⚠️ **`loadMemberships`를 넓히지 않고 함수를 나눈 이유**: 그쪽은 **셸이 매 페이지에서** 부른다.
 * 거기에 `_count`와 집계를 얹으면 모든 화면이 목록 하나를 위한 왕복을 물게 되고, 그것이
 * PRODUCT §7.7 결정 5(사이드바 카운트 거절)가 막은 것과 같은 축이다.
 *
 * ⚠️ **멤버 수는 `_count` 서브쿼리라 왕복이 +0이다** — 프로젝트마다 세면 N+1이 되고, 도쿄 리전
 * 왕복 하나가 그대로 붙는다(CLAUDE.md 가상화 절의 실측).
 *
 * ⚠️ **`userId`로 좁힌다** — 목록의 단위가 "내 멤버십"이다 (POSTMORTEM 2026-09-06). 그 결과의
 * `id` 집합이 아래 집계의 테넌트 경계가 된다: 다른 출처에서 만들지 않는다 (불변식 5).
 */
export async function loadProjectList(
  prisma: PrismaClient,
  userId: string,
  /**
   * **테스트 주입 전용이다.** 기본은 installation 토큰으로 실제 GitHub을 친다 — 인자를 둔 이유는
   * `lib/pull/client.ts`가 인터페이스를 갈라 둔 것과 같다: 그렇지 않으면 하네스 테스트가 조용히
   * 실 네트워크를 잡으려 든다. **화면이 이 값을 넘기지 않는다.**
   */
  options: { loadRemote?: typeof loadRemoteSignals } = {},
): Promise<ProjectListView> {
  const rows = await prisma.projectMember.findMany({
    where: { userId },
    select: {
      role: true,
      project: {
        select: {
          // ⚠️ **서버 안에서만 쓴다** — 집계를 묶는 키이고 `ProjectListRow`에는 안 나간다.
          id: true,
          slug: true,
          name: true,
          installationId: true,
          lastCommitSha: true,
          archivedAt: true,
          repoOwner: true,
          repoName: true,
          repositoryId: true,
          baseBranch: true,
          lastPrUrl: true,
          // 임포트 진행·결과 (projects-list design §3.35) — 띠와 Meter 자리가 이 둘로 갈린다.
          lastImportStartedAt: true,
          lastImportError: true,
          // 원격 경로 판정의 입력 (projects-list §3.4).
          adapterName: true,
          pathTemplate: true,
          /**
           * ⚠️ **orphaned도 포함한 전체 저장 로케일이다** — 탐지 정규식이 거르는 코드(`es-419`·
           * `zh-Hant-TW`)의 파일을 그 코드로 만든 정확한 경로로 지킨다. 서브쿼리라 왕복이 +0이다.
           */
          locales: { select: { code: true } },
          _count: { select: { members: true } },
        },
      },
    },
    // 결정적 순서 — 목록이 렌더마다 흔들리면 사용자가 항목을 근육 기억으로 못 찾는다.
    orderBy: { project: { slug: "asc" } },
  });

  // 멤버십이 0이면 집계도 원격도 0회다 — 빈 `in`으로 왕복을 만들지 않는다.
  const ids = rows.map((r) => r.project.id);
  /**
   * ⚠️ **DB 집계와 원격 조회를 함께 시작한다** (design §3.4). 순서가 있는 것이 아니라 둘 다 끝나야
   * 행이 완성되는 것이고, 순차로 보내면 GitHub 왕복이 DB 왕복 **뒤에** 붙는다.
   *
   * ⚠️ **원격은 실패해도 목록을 죽이지 않는다** — 그 함수가 실패를 값으로 접는다.
   */
  const [aggregates, remote] = await Promise.all([
    loadProjectListAggregates(prisma, ids),
    (options.loadRemote ?? loadRemoteSignals)(
      rows.map((r) => ({
        projectId: r.project.id,
        repoOwner: r.project.repoOwner,
        repoName: r.project.repoName,
        installationId: r.project.installationId,
        repositoryId: r.project.repositoryId,
        baseBranch: r.project.baseBranch,
        lastCommitSha: r.project.lastCommitSha,
        lastPrUrl: r.project.lastPrUrl,
        adapterName: r.project.adapterName,
        pathTemplate: r.project.pathTemplate,
        storedLocales: r.project.locales.map((l) => l.code),
        archived: r.project.archivedAt !== null,
      })),
    ),
  ]);
  const meters = rowLocaleProgress(aggregates.locales, aggregates.keyTotals, aggregates.cells);

  const review = new Map<string, number>();
  const live = new Set(aggregates.locales.map((l) => `${l.projectId}/${l.code}`));
  for (const cell of aggregates.cells) {
    if (!cell.needsReview) continue;
    // ③은 orphaned 로케일의 셀을 포함할 수 있다 — ①에 없는 것은 버린다 (design §3.1).
    if (!live.has(`${cell.projectId}/${cell.localeCode}`)) continue;
    review.set(cell.projectId, (review.get(cell.projectId) ?? 0) + cell.count);
  }

  return {
    rows: rows.map((r) => ({
      slug: r.project.slug,
      name: r.project.name,
      role: r.role,
      installationId: r.project.installationId,
      lastCommitSha: r.project.lastCommitSha,
      archivedAt: r.project.archivedAt,
      repoOwner: r.project.repoOwner,
      repoName: r.project.repoName,
      repositoryId: r.project.repositoryId,
      memberCount: r.project._count.members,
      baseBranch: r.project.baseBranch,
      lastPrUrl: r.project.lastPrUrl,
      meters: meters.get(r.project.id) ?? [],
      events: {
        review: review.get(r.project.id) ?? 0,
        unsent: aggregates.unsent.get(r.project.id) ?? 0,
        // 조회가 실패했거나 입력이 없으면 둘 다 "없음"이다 — 그 띠만 빠지고 나머지는 DB만으로 선다.
        openPr: remote.get(r.project.id)?.openPr ?? null,
        repoAheadFiles: remote.get(r.project.id)?.repoAheadFiles ?? 0,
        // DB 컬럼의 문자열이라 판정 함수로 거른다 — 모르는 값은 무시한다.
        importError: isImportFailureCode(r.project.lastImportError) ? r.project.lastImportError : null,
        importing: r.project.lastImportStartedAt !== null,
      },
    })),
    summary: summaryQueue({
      projects: rows.map((r) => ({ projectId: r.project.id, archived: r.project.archivedAt !== null })),
      locales: aggregates.locales,
      keyTotals: aggregates.keyTotals,
      cells: aggregates.cells,
      newKeys: aggregates.newKeys,
      unsent: aggregates.unsent,
    }),
  };
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

/**
 * Home의 최근 활동 재료 — **사람이 만진 편집만** (6b-6).
 *
 * ⚠️ **`updatedBy: { not: null }`이 빠지면 안 된다.** push는 그 컬럼을 비우면서 전 행의 `updatedAt`을
 * 올리므로(strict — ARCHITECTURE §0 불변식 2), 조건이 없으면 code push 직후 활동 목록이 **903건의 "편집"**으로 덮인다.
 * `countUnpublished`가 같은 술어를 쓰는 것과 같은 이유다.
 *
 * ⚠️ **`take`가 인덱스 앞에 있다.** `@@index([projectId, updatedAt])`를 역방향으로 타 첫 N행에서
 * 멈춘다 — 정렬 없이 전부 읽어 JS에서 자르면 903키 리포에서 전 행이 넘어온다.
 *
 * ⚠️ **`value`를 select하지 않는다.** 활동 목록은 "무엇이 바뀌었나"를 키 이름으로 말하고, 값을
 * 실으면 번역 본문 전체가 이 화면에 따라온다.
 */
export type RecentEditRow = {
  at: Date;
  key: string;
  namespace: string;
  locale: string;
  /** SQL이 null을 걸렀으므로 여기서 좁힌다 — 화면이 다시 가드하지 않는다. */
  updatedBy: string;
};

export async function loadRecentEdits(
  prisma: PrismaClient,
  projectId: string,
  limit: number,
): Promise<RecentEditRow[]> {
  const rows = await prisma.translation.findMany({
    // ⚠️ **`projectId`로 좁힌다** — RLS가 없어 애플리케이션이 유일한 테넌트 방어선이다.
    where: { projectId, updatedBy: { not: null } },
    /**
     * ⚠️ **보조 키가 있어야 어느 N건이 오는지 결정적이다.** 경계 시각을 공유하는 행이 셋인데
     * `take`가 둘만 받으면, 보조 키 없이는 그 셋 중 무엇이 오는지가 요청마다 달라진다. 화면 순서의
     * 보증은 `recentActivity`가 따로 들고 있다 — 이쪽은 **선택**을 고정한다.
     */
    orderBy: [{ updatedAt: "desc" }, { keyId: "asc" }, { localeCode: "asc" }],
    take: limit,
    select: {
      updatedAt: true,
      updatedBy: true,
      localeCode: true,
      stringKey: { select: { key: true, namespace: true } },
    },
  });
  return rows.flatMap((row) =>
    // `updatedBy`는 위 `where`가 보장하지만 타입은 nullable이다 — 단언 대신 걸러 낸다.
    row.updatedBy === null
      ? []
      : [{
          at: row.updatedAt,
          key: row.stringKey.key,
          namespace: row.stringKey.namespace,
          locale: row.localeCode,
          updatedBy: row.updatedBy,
        }],
  );
}

/**
 * 목록 집계 다섯 — **왕복 수가 프로젝트 수와 무관하다** (projects-list design §3).
 *
 * ⚠️ **`Promise.all`로 보낸다.** 순차로 보내면 도쿄 리전 왕복이 다섯 번 쌓이고, 그 고정 비용은
 * 이미 실측돼 있다 (POSTMORTEM 2026-09-09 — 3.3초의 원인이 함수 리전이었다).
 *
 * ⚠️ **`loadLocaleCounts`를 재사용하지 않는다** — 그쪽은 프로젝트 하나 전용이고 셀을 **행으로**
 * 전부 가져온다. 여기 필요한 것은 개수뿐이라 `groupBy`가 맞고, 그래서 `value`가 애초에 안 딸려온다.
 */
export type ProjectListAggregates = {
  /** ① 살아 있는 로케일. */
  locales: LiveLocale[];
  /** ② 살아 있는 키 수 — 전 로케일 공통 분모다. */
  keyTotals: Map<string, number>;
  /** ③ 값이 있는 셀의 (로케일 × 검토여부) 개수. */
  cells: LocaleCellCount[];
  /** ④ 마지막 pull 이후 추가된 활성 키 수. */
  newKeys: Map<string, number>;
  /** ⑤ 안 보낸 편집 수. */
  unsent: Map<string, number>;
};

export async function loadProjectListAggregates(
  prisma: PrismaClient,
  projectIds: readonly string[],
): Promise<ProjectListAggregates> {
  // 빈 `in`으로 왕복을 만들지 않는다 — `loadActors`가 같은 이유로 같은 가드를 든다.
  if (projectIds.length === 0) {
    return { locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map() };
  }
  const ids = [...projectIds];

  const [locales, keyRows, cellRows, newRows, unsentRows] = await Promise.all([
    prisma.locale.findMany({
      where: { projectId: { in: ids }, orphaned: false },
      select: { projectId: true, code: true, isBase: true },
    }),
    // `@@index([projectId, orphaned])`를 그대로 탄다.
    prisma.stringKey.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, orphaned: false },
      _count: { _all: true },
    }),
    /**
     * `@@index([projectId, localeCode, needsReview])`를 탄다.
     *
     * ⚠️ **orphaned 로케일의 번역이 섞여 올 수 있다** — 로케일의 생사는 여기 조건에 없다. 접기에서
     * ①의 활성 (projectId, code) 집합에 없는 그룹을 버린다 (`rowLocaleProgress`의 `foldCells`).
     */
    prisma.translation.groupBy({
      by: ["projectId", "localeCode", "needsReview"],
      where: { projectId: { in: ids }, value: { not: "" }, stringKey: { orphaned: false } },
      _count: { _all: true },
    }),
    /**
     * ④ 신규 키 — **기준은 임포트가 아니라 pull이다** (design §3.2). `lastPulledAt`은 성공한 pull이
     * 처리한 번역 스냅샷의 기준 시각이고, 첫 pull 전에는 활성 키 전체가 신규다(승인된 정의).
     *
     * ⚠️ **파라미터화한 `ANY`다** — 문자열 연결·`$queryRawUnsafe`를 쓰지 않는다.
     */
    prisma.$queryRaw<{ projectId: string; n: number }[]>`
      SELECT k."projectId", COUNT(*)::int AS n
      FROM "StringKey" k JOIN "Project" p ON p."id" = k."projectId"
      WHERE k."projectId" = ANY(${ids}::text[])
        AND k."orphaned" = false
        AND p."archivedAt" IS NULL
        AND (p."lastPulledAt" IS NULL OR k."createdAt" > p."lastPulledAt")
      GROUP BY k."projectId"`,
    /**
     * ⑤ 미발송 — **`countUnpublished`·`isUnpublished`와 같은 술어의 세 번째 자리다**
     * (`lib/keys/query.ts`의 `countUnpublished` · `lib/keys/view.ts`의 `isUnpublished`).
     *
     * ⚠️ **`updatedBy IS NOT NULL`이 빠지면 안 된다.** push가 전 행의 `updatedAt`을 올리므로
     * (strict — ARCHITECTURE §0 불변식 2) 조건이 없으면 code push 직후 903키 전부가
     * "안 보낸 편집"이 된다.
     *
     * ⚠️ **활성 로케일 필터를 덧붙이지 않는다** — 미발송의 기존 계약과 진행률의 분모는 다른 문제다.
     * `p."archivedAt" IS NULL`은 목록 Summary의 **프로젝트 선택 조건**이지 셀 술어가 아니다.
     */
    prisma.$queryRaw<{ projectId: string; n: number }[]>`
      SELECT t."projectId", COUNT(*)::int AS n
      FROM "Translation" t JOIN "Project" p ON p."id" = t."projectId"
      WHERE t."projectId" = ANY(${ids}::text[])
        AND t."updatedBy" IS NOT NULL
        AND p."archivedAt" IS NULL
        AND (p."lastPulledAt" IS NULL OR t."updatedAt" > p."lastPulledAt")
      GROUP BY t."projectId"`,
  ]);

  return {
    locales,
    keyTotals: new Map(keyRows.map((r) => [r.projectId, r._count._all])),
    cells: cellRows.map((r) => ({
      projectId: r.projectId,
      localeCode: r.localeCode,
      needsReview: r.needsReview,
      count: r._count._all,
    })),
    newKeys: new Map(newRows.map((r) => [r.projectId, r.n])),
    unsent: new Map(unsentRows.map((r) => [r.projectId, r.n])),
  };
}
