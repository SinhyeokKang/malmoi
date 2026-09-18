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
  rowReviewCounts,
  type LiveLocale,
  type LocaleCellCount,
  type ProjectEvents,
  type RowLocaleProgress,
} from "@/lib/projects/list";
import { countPending } from "@/lib/protection/where";
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
  surfaceId: string;
  surfaceSlug: string;
  surfaces: { id: string; slug: string; archivedAt: Date | null; lastCommitSha: string | null; pathTemplate: string | null }[];
  slug: string;
  name: string;
  repoOwner: string;
  repoName: string;
  /** Publish 모달이 "무엇을 덮는가"를 말할 때 든다 — 조회가 실패한 갈래도 이 이름을 말해야 한다. */
  baseBranch: string;
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
export async function loadProject(prisma: PrismaClient, projectId: string, surfaceId: string): Promise<ProjectContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, slug: true, name: true, repoOwner: true, repoName: true, baseBranch: true,
      installationId: true,
      lastPulledAt: true, lastPublishedAt: true, lastPrUrl: true,
      surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" }, include: {
        locales: { select: { code: true, name: true, isBase: true, orphaned: true }, orderBy: { code: "asc" } },
      } },
    },
  });
  const surface = project?.surfaces.find(s => s.id === surfaceId);
  if (!project || !surface) return null;
  return { ...project, surfaceId, surfaceSlug: surface.slug, lastCommitSha: surface.lastCommitSha,
    baseLocale: surface.baseLocale, declaredBaseLocale: surface.declaredBaseLocale, locales: surface.locales };
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
  surfaceId: string,
): Promise<KeyRow[]> {
  const keys = await prisma.stringKey.findMany({
    where: { projectId, surfaceId },
    orderBy: { key: "asc" },
    select: {
      id: true, key: true, namespace: true, description: true, orphaned: true, createdAt: true,
      surface: { select: { archivedAt: true } },
      translations: {
        // 토큰 원문은 select해도 셀로 옮기지 않는다 — 셀은 RSC 페이로드로 화면에 간다 (sync-edit-protection — ARCHITECTURE §5의 `pendingEditToken`).
        select: { localeCode: true, value: true, needsReview: true, updatedBy: true, updatedAt: true, pendingEditToken: true,
          locale: { select: { orphaned: true } } },
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
        surfaceArchivedAt: k.surface.archivedAt,
        // `pendingWhere`와 같은 조건의 투영 — orphan 키·로케일의 남은 토큰은 미전달이 아니다.
        pending: t.pendingEditToken !== null && !k.orphaned && !t.locale.orphaned,
      };
    }
    return {
      id: k.id,
      key: k.key,
      namespace: k.namespace,
      description: k.description,
      orphaned: k.orphaned,
      createdAt: k.createdAt,
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
 * 아직 전달 확인되지 않은 편집의 **수**. `isUnpublished`(`./view`)의 집계 형태이고, where 조각은 pull 1층·Publish
 * 미리보기와 같은 `pendingWhere`다 (sync-edit-protection T8). 목록의 `loadProjectListAggregates` raw ⑤만 SQL 사본이다.
 *
 * ⚠️ **시각·저자로 세지 않는다** — push가 전 행의 `updatedAt`을 올리고, 같은 밀리초의 재저장을 시각으로는 못 가른다.
 * ⚠️ **`projectId`로 좁힌다** — RLS가 없어 애플리케이션이 유일한 테넌트 방어선이다.
 */
export async function countUnpublished(
  prisma: PrismaClient,
  projectId: string,
  surfaceId?: string,
): Promise<number> {
  return countPending(prisma, projectId, surfaceId);
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
  surfaces: { archivedAt: Date | null; lastCommitSha: string | null }[];
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
        select: { slug: true, name: true, installationId: true, surfaces: { select: { archivedAt: true, lastCommitSha: true } }, archivedAt: true },
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
    surfaces: r.project.surfaces,
    archivedAt: r.project.archivedAt,
  }));
}

/**
 * 목록 화면의 한 행 (8-3 · projects-list §3). `MembershipRow`에 **그 화면만 쓰는 것들**이 붙는다.
 *
 * ⚠️ **`Project.id`를 싣지 않는다** — 화면이 아는 식별자는 slug 하나로 남긴다. 내부 id는 집계를
 * 묶는 서버 안의 값이고, 그것을 RSC 페이로드에 흘리면 URL이 아닌 경로로 새는 식별자가 하나 는다.
 */
export type ProjectListRow = MembershipRow &
  /**
   * ⚠️ **사건을 중첩하지 않고 펼친다** — 판정 셋(`projectStatus`·`rowBanner`·`meterSlot`)이
   * `ProjectStatusInput & ProjectEvents`를 받으므로, 중첩하면 화면이 렌더마다 `{...row, ...row.events}`를
   * 새로 만들어야 하고 그 합성이 판정의 입력이 된다.
   */
  ProjectEvents & {
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
  reviewSurfaceSlug: string | null;
  unsentSurfaceSlug: string | null;
  repoAheadFrom: string | null;
};

/**
 * 목록 한 화면분.
 *
 * ⚠️ **2026-09-15에 `summary`가 빠졌다** (projects-panel-rework) — 계정 단위 큐 넷이 화면에서
 * 사라졌고, 그 집계는 `project-home`이 받는다(`summaryQueue`·raw ④는 그대로 있다).
 */
export type ProjectListView = { rows: ProjectListRow[] };

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
          surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" }, include: { locales: { select: { code: true } } } },
          archivedAt: true,
          repoOwner: true,
          repoName: true,
          repositoryId: true,
          baseBranch: true,
          lastPrUrl: true,
          // 임포트 진행·결과 (projects-list design §3.35) — 띠와 Meter 자리가 이 둘로 갈린다.
          // 원격 경로 판정의 입력 (projects-list §3.4).
          /**
           * ⚠️ **orphaned도 포함한 전체 저장 로케일이다** — 탐지 정규식이 거르는 코드(`es-419`·
           * `zh-Hant-TW`)의 파일을 그 코드로 만든 정확한 경로로 지킨다. 서브쿼리라 왕복이 +0이다.
           */
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
        surfaces: r.project.surfaces.map(s => ({ lastCommitSha: s.lastCommitSha, adapterName: s.adapterName,
          pathTemplate: s.pathTemplate, storedLocales: s.locales.map(l => l.code) })),
        lastPrUrl: r.project.lastPrUrl,
        archived: r.project.archivedAt !== null,
      })),
    ),
  ]);
  const meters = rowLocaleProgress(aggregates.locales, aggregates.keyTotals, aggregates.cells);

  // ③은 orphaned 로케일의 셀을 포함할 수 있다 — 그 필터는 `rowReviewCounts`가 Meter와 **같은 접기**로 한다.
  const review = rowReviewCounts(aggregates.locales, aggregates.cells);

  return {
    rows: rows.map((r) => ({
      slug: r.project.slug,
      name: r.project.name,
      role: r.role,
      installationId: r.project.installationId,
      surfaces: r.project.surfaces.map(s => ({ archivedAt: s.archivedAt, lastCommitSha: s.lastCommitSha })),
      archivedAt: r.project.archivedAt,
      repoOwner: r.project.repoOwner,
      repoName: r.project.repoName,
      repositoryId: r.project.repositoryId,
      memberCount: r.project._count.members,
      baseBranch: r.project.baseBranch,
      lastPrUrl: r.project.lastPrUrl,
      meters: meters.get(r.project.id) ?? [],
      reviewSurfaceSlug: aggregates.locales.filter(l => l.projectId === r.project.id && aggregates.cells.some(c => c.surfaceId === l.surfaceId && c.localeCode === l.code && c.needsReview && c.count > 0)).map(l => l.surfaceSlug).sort()[0] ?? null,
      unsentSurfaceSlug: aggregates.unsentSurfaces.get(r.project.id) ?? null,
      repoAheadFrom: remote.get(r.project.id)?.repoAheadFrom ?? null,
      review: review.get(r.project.id) ?? 0,
      unsent: aggregates.unsent.get(r.project.id) ?? 0,
      // 조회가 실패했거나 입력이 없으면 둘 다 "없음"이다 — 그 띠만 빠지고 나머지는 DB만으로 선다.
      openPr: remote.get(r.project.id)?.openPr ?? null,
      repoAheadFiles: remote.get(r.project.id)?.repoAheadFiles ?? 0,
      // DB 컬럼의 문자열이라 판정 함수로 거른다 — 모르는 값은 무시한다.
      importError: r.project.surfaces.map(s => s.lastImportError).find(isImportFailureCode) ?? null,
      importing: r.project.surfaces.some(s => s.lastImportStartedAt !== null),
    })),
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

export async function loadLocaleCounts(prisma: PrismaClient, projectId: string, surfaceId: string): Promise<LocaleCounts> {
  const [total, cells] = await Promise.all([
    prisma.stringKey.count({ where: { projectId, surfaceId, orphaned: false, surface: { archivedAt: null } } }),
    prisma.translation.findMany({
      where: { projectId, surfaceId, surface: { archivedAt: null }, value: { not: "" }, stringKey: { orphaned: false } },
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
  surfaceSlug: string;
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
    where: { projectId, surface: { archivedAt: null }, updatedBy: { not: null } },
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
      surface: { select: { slug: true } },
      stringKey: { select: { key: true, namespace: true } },
    },
  });
  return rows.flatMap((row) =>
    // `updatedBy`는 위 `where`가 보장하지만 타입은 nullable이다 — 단언 대신 걸러 낸다.
    row.updatedBy === null || row.surface === null
      ? []
      : [{
          surfaceSlug: row.surface.slug,
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
  unsentSurfaces: Map<string, string>;
};

export async function loadProjectListAggregates(
  prisma: PrismaClient,
  projectIds: readonly string[],
): Promise<ProjectListAggregates> {
  // 빈 `in`으로 왕복을 만들지 않는다 — `loadActors`가 같은 이유로 같은 가드를 든다.
  if (projectIds.length === 0) {
    return { locales: [], keyTotals: new Map(), cells: [], newKeys: new Map(), unsent: new Map(), unsentSurfaces: new Map() };
  }
  const ids = [...projectIds];

  const [locales, keyRows, cellRows, newRows, unsentRows] = await Promise.all([
    prisma.locale.findMany({
      where: { projectId: { in: ids }, orphaned: false, surface: { archivedAt: null } },
      select: { projectId: true, surfaceId: true, surface: { select: { slug: true } }, code: true, isBase: true },
    }),
    // `@@index([projectId, orphaned])`를 그대로 탄다.
    prisma.stringKey.groupBy({
      by: ["projectId", "surfaceId"],
      where: { projectId: { in: ids }, orphaned: false, surface: { archivedAt: null } },
      _count: { _all: true },
    }),
    /**
     * `@@index([projectId, localeCode, needsReview])`를 탄다.
     *
     * ⚠️ **orphaned 로케일의 번역이 섞여 올 수 있다** — 로케일의 생사는 여기 조건에 없다. 접기에서
     * ①의 활성 (projectId, code) 집합에 없는 그룹을 버린다 (`rowLocaleProgress`의 `foldCells`).
     */
    prisma.translation.groupBy({
      by: ["projectId", "surfaceId", "localeCode", "needsReview"],
      where: { projectId: { in: ids }, surface: { archivedAt: null }, value: { not: "" }, stringKey: { orphaned: false } },
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
      JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s."id" = k."surfaceId"
      WHERE k."projectId" = ANY(${ids}::text[])
        AND k."orphaned" = false
        AND s."archivedAt" IS NULL
        AND p."archivedAt" IS NULL
        AND (p."lastPulledAt" IS NULL OR k."createdAt" > p."lastPulledAt")
      GROUP BY k."projectId"`,
    /**
     * ⑤ 미발송 — **`pendingWhere`(`lib/protection/where.ts`)의 SQL 사본이다.** `countUnpublished`·`isUnpublished`·
     * pull 1층·Publish 미리보기와 같은 행을 센다(`pnpm test:projects:postgres`가 대조한다).
     *
     * ⚠️ **토큰으로 판정한다** — 시각·저자 조건을 되살리면 push 직후 전 행이 "안 보낸 편집"이 되거나(T0) 같은 밀리초
     * 재저장을 못 가른다(sync-edit-protection T8).
     * ⚠️ **orphan 키·로케일을 뺀다** (2026-09-18에 뒤집었다 — 전에는 "활성 로케일 필터를 덧붙이지 않는다"가 의도였다).
     * 그 셀은 export에 안 나가므로 세면 Publish로 영영 0이 안 되는 수가 되고, 보호 배포 뒤엔 CI가 영구 보류된다.
     * `p."archivedAt" IS NULL`은 목록 Summary의 **프로젝트 선택 조건**이지 셀 술어가 아니다.
     */
    prisma.$queryRaw<{ projectId: string; surfaceSlug: string; n: number }[]>`
      SELECT t."projectId", MIN(s."slug") AS "surfaceSlug", COUNT(*)::int AS n
      FROM "Translation" t JOIN "Project" p ON p."id" = t."projectId"
      JOIN "TranslationSurface" s ON s."projectId" = t."projectId" AND s."id" = t."surfaceId"
      JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
      JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
      WHERE t."projectId" = ANY(${ids}::text[])
        AND t."pendingEditToken" IS NOT NULL
        AND s."archivedAt" IS NULL
        AND k."orphaned" = false
        AND l."orphaned" = false
        AND p."archivedAt" IS NULL
      GROUP BY t."projectId"`,
  ]);

  return {
    locales: locales.flatMap(l => l.surfaceId === null || l.surface === null ? [] : [{ projectId: l.projectId,
      surfaceId: l.surfaceId, surfaceSlug: l.surface.slug, code: l.code, isBase: l.isBase }]),
    keyTotals: new Map(keyRows.flatMap(r => r.surfaceId === null ? [] : [[r.surfaceId, r._count._all] as const])),
    cells: cellRows.flatMap((r) => r.surfaceId === null ? [] : [{
      projectId: r.projectId,
      surfaceId: r.surfaceId,
      localeCode: r.localeCode,
      needsReview: r.needsReview,
      count: r._count._all,
    }]),
    /**
     * ⚠️ **소비자가 지금 없다 — 지우지 않는다** (2026-09-15). 목록의 Summary가 사라지면서 이 raw
     * 집계(④)를 읽는 화면이 0이 됐고, `project-home`의 `New from GitHub`이 그것을 받는다
     * (`docs/features/project-home/design.md` §3.1).
     *
     * ⚠️ **지웠다 다시 만들면 미발송 술어의 넷째 벌을 만드는 셈이다** — CLAUDE.md가 명시적으로
     * 금지하고, `pnpm test:projects:postgres`가 "셋이 같은 행을 세나"를 재는 유일한 자리다.
     */
    newKeys: new Map(newRows.map((r) => [r.projectId, r.n])),
    unsent: new Map(unsentRows.map((r) => [r.projectId, r.n])),
    unsentSurfaces: new Map(unsentRows.map((r) => [r.projectId, r.surfaceSlug])),
  };
}

/**
 * ── Home(`/projects/:slug`) 전용 조회 넷 (project-home design §3.3.1·§3.4) ──────────────
 *
 * ⚠️ **전부 `projectId`로 좁힌다** — RLS가 없어 애플리케이션이 유일한 테넌트 방어선이고, 인덱스가
 * 전부 `projectId` 선두 복합이라 안 좁히면 풀스캔이다 (CLAUDE.md).
 */

/** 검토 대기 항목 하나의 재료. `updatedBy`는 **그 로케일의 가장 최근 편집 행**의 값이다. */
export type ReviewAttentionRow = { surfaceId: string; localeCode: string; count: number; at: Date; updatedBy: string | null };

/**
 * 로케일별 검토 대기 수 + **그 로케일의 마지막 편집자·시각** (design §3.3.1의 구멍 ①).
 *
 * ⚠️ **`loadRecentEdits`로는 안 된다** — 그쪽은 프로젝트 전체의 최근 N건이라 검토가 밀린 로케일이
 * 통째로 빠질 수 있다. 여기 필요한 것은 "그 로케일에서 마지막으로 만진 사람"이고, 그것은 창과
 * 무관하게 존재한다.
 *
 * ⚠️ **저자를 검토 대기 행에서 뽑지 않는다** (2026-09-15 Codex 리뷰 🟡3). `needsReview = true`는
 * **push가 세우는 플래그**이고 같은 쓰기가 `updatedBy`를 비운다(불변식 2) — 그 행에서 저자를
 * 찾으면 **거의 언제나 `null`이라 `— last edited by …` 절이 영영 안 뜬다.** 파티션을 그 로케일의
 * **값이 있는 셀 전체**로 두고, 대표 행은 `updatedBy IS NOT NULL` 중 최신을 고른다.
 *
 * ⚠️ **정렬 키(`at`)는 대표 행의 시각이 아니라 파티션의 `MAX`다** — 항목이 서는 축은 "그 로케일에
 * 마지막으로 무슨 일이 있었나"이고, 사람이 안 만진 로케일에서도 push 시각이 그 답이다.
 *
 * ⚠️ **한 왕복이다.** 창(window) 함수로 세고 `DISTINCT ON`으로 대표 행을 고른다 — 로케일마다
 * 조회하면 59로케일 리포에서 그만큼 왕복이 붙는다 (POSTMORTEM 2026-09-05).
 *
 * ⚠️ **`ORDER BY`에 보조 키가 있다** — 같은 시각의 편집 둘이 있으면 어느 행의 `updatedBy`가 뽑힐지가
 * 요청마다 달라지고, 그러면 같은 DB 상태가 다른 이름을 낸다.
 *
 * ⚠️ **`Locale`을 join해 orphaned 로케일을 뺀다 — `foldCells`와 같은 술어여야 한다.** 그 파일은
 * 리포에서 사라졌고 번역 화면에서 그 행의 입력이 `disabled`다(ARCHITECTURE §5.5.16): 항목으로
 * 세우면 번역자를 **편집할 수 없는 행**으로 데려가고, 카드의 수는 그것을 빼므로 **pill과 카드가
 * 같은 화면에서 어긋난다** (code-review 2026-09-15 🔴1).
 */
export async function loadReviewAttention(prisma: PrismaClient, projectId: string): Promise<ReviewAttentionRow[]> {
  const rows = await prisma.$queryRaw<{ surfaceId: string; localeCode: string; at: Date; updatedBy: string | null; n: number }[]>`
    SELECT DISTINCT ON (t."surfaceId", t."localeCode")
      t."surfaceId", t."localeCode",
      MAX(t."updatedAt") OVER (PARTITION BY t."surfaceId", t."localeCode") AS "at",
      t."updatedBy",
      COUNT(*) FILTER (WHERE t."needsReview") OVER (PARTITION BY t."surfaceId", t."localeCode")::int AS n
    FROM "Translation" t
    JOIN "TranslationSurface" s ON s."projectId" = t."projectId" AND s."id" = t."surfaceId"
    JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."id" = t."keyId"
    JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
    WHERE t."projectId" = ${projectId}
      AND s."archivedAt" IS NULL
      AND k."orphaned" = false
      AND l."orphaned" = false
      AND t."value" <> ''
    ORDER BY t."surfaceId", t."localeCode", (t."updatedBy" IS NOT NULL) DESC, t."updatedAt" DESC, t."keyId" ASC`;
  // 검토 대기가 0인 로케일은 항목이 아니다 — 파티션이 그 로케일 전체라 여기서 거른다.
  return rows.flatMap((row) => (row.n === 0 ? [] : [{
    surfaceId: row.surfaceId, localeCode: row.localeCode, count: row.n, at: row.at, updatedBy: row.updatedBy,
  }]));
}

/**
 * 표면별로 **마지막 Sync가 들여온 키 수** — 로그의 `CI synced {n} new keys into {surface}`.
 *
 * ⚠️ **`lastPulledAt` 기준의 ④와 다른 수다.** 저쪽은 "마지막 pull 이후 리포에서 들어온 것"이고
 * 여기는 "마지막 Sync가 들여온 것"이다 — 카드와 로그가 말하는 시점이 다르므로 같은 수를 쓰면
 * 둘 중 하나가 거짓이 된다.
 */
export async function loadLastSyncNewKeys(prisma: PrismaClient, projectId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ surfaceId: string; n: number }[]>`
    SELECT k."surfaceId", COUNT(*)::int AS n
    FROM "StringKey" k
    JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s."id" = k."surfaceId"
    WHERE k."projectId" = ${projectId}
      AND k."orphaned" = false
      AND s."archivedAt" IS NULL
      AND s."lastCommitAt" IS NOT NULL
      AND k."createdAt" >= s."lastCommitAt"
    GROUP BY k."surfaceId"`;
  return new Map(rows.map((row) => [row.surfaceId, row.n]));
}

/** 되돌려보낸 실행 하나. **`prUrl`은 링크가 아니라 번호의 출처다** — 로그 줄은 번호만 쓴다. */
export type PublishRun = { at: Date; prUrl: string | null; changed: number | null };

/**
 * 창 안의 **성공한** Publish (design §3.4).
 *
 * ⚠️ **`SUCCEEDED`만이다.** `skipped`는 보낸 것이 없어 사건이 아니고(`lastPublishedAt`도 안 건드린다),
 * 실패는 `changed`가 `null`이라 문장이 "0 files changed"가 된다 — 실패엔 관측 자체가 없다.
 *
 * ⚠️ **`finishedAt`이 아니라 `startedAt`으로 좁힌다** — `@@index([projectId, startedAt])`를 역방향으로
 * 탄다. 둘의 차이는 실행 시간뿐이고 이 창은 7일이다.
 */
export async function loadRecentPublishes(
  prisma: PrismaClient,
  projectId: string,
  since: Date,
  limit: number,
): Promise<PublishRun[]> {
  const rows = await prisma.syncRun.findMany({
    where: { projectId, status: "SUCCEEDED", finishedAt: { not: null }, startedAt: { gte: since } },
    orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { finishedAt: true, prUrl: true, changed: true },
  });
  // `finishedAt`은 위 `where`가 보장하지만 타입은 nullable이다 — 단언 대신 걸러 낸다.
  return rows.flatMap((row) => (row.finishedAt === null ? [] : [{ at: row.finishedAt, prUrl: row.prUrl, changed: row.changed }]));
}
