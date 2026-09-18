import { Languages } from "lucide-react";
import { syncBranchFor } from "@/lib/pull/trigger";
import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { PanelBody } from "@/components/shell/content-panel";
import { ProjectNotReady } from "@/components/project-not-ready";
import { Announcer } from "@/components/translations/announcer";
import { TranslationsHeader } from "@/components/translations/header";
import { KeyGroup } from "@/components/translations/key-group";
import { Table, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/relative-time";
import { requireSurfaceAccess } from "@/lib/surfaces/access";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { countUnpublished, loadActors, loadKeys, loadProject } from "@/lib/keys/query";
import {
  collectActorIds, filterByState, filterRows, groupByNamespace, namespaceCountsFor,
  parseLocaleSelection, pendingFirst, resolveNamespace,
} from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { ALL_NAMESPACES, isKeyState, routes, type TranslationsQuery } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/**
 * 번역 화면 — **키 하나가 한 그룹이고 로케일이 그 아래 행으로 쌓인다** (8-4, 시안 `212:937`).
 *
 * 로케일이 열이던 시절에는 로케일이 늘 때마다 가로가 늘어 6개에서 표가 화면을 넘었다. 행이 축이면
 * 그 문제가 사라지는 대신 세로가 로케일 배수로 는다 — ⚠️ **다만 `<Textarea>` 수는 그대로다**
 * (903키 × 3로케일 = 2,709). 늘어나는 것은 행 래퍼와 로케일 배지이고 입력보다 싸다 (ARCHITECTURE §1.95).
 *
 * **base 로케일도 편집 가능하다** — 고정된 것은 키뿐이다. 화면의 base 값은 `StringKey.sourceText`가
 * 아니라 `cells[base]`다. ⚠️ **`sourceText`는 이 화면에 실리지 않는다** (2026-09-04 audit #47).
 *
 * ⚠️ **기본 착지는 "남은 일이 있는" 첫 네임스페이스다** (6a T2). 그 판정이 축 변경을 그대로
 * 통과한다 — `defaultNamespace`가 로케일을 인자로 안 받게 만들어 둔 것이 여기서 값을 한다.
 *
 * 시각 규칙은 docs/DESIGN.md — 키·로케일 코드는 **sans**(§4.1: mono는 8-P의 diff로 간다),
 * 배지(§6.2), 표 규칙(§6.1).
 */

/**
 * ⚠️ **Server Action은 자기를 부른 페이지 세그먼트의 `maxDuration`을 쓴다** (설정 화면과 같은 이유).
 * 이 화면의 [Send changes]가 `triggerPullAction`을 부르고 그것이 로케일 파일마다 blob을 읽는다.
 *
 * ⚠️ **`STALE_AFTER_SECONDS`(300)의 전제가 이 줄이다** (7단계 — ARCHITECTURE §5.6.2). 없으면 이
 * 세그먼트가 프로젝트 기본값(300)을 쓰고, 그러면 stale 판정 창과 실행 상한이 **같아져** 정상 실행이
 * 스스로를 stale로 보고 두 번째 실행을 허용한다.
 */
export const maxDuration = 60;

/**
 * ⚠️ 이 타입이 URL 계약이다 — `entry-points.test.ts`가 `routes.translations`의 키와 대조한다.
 *
 * ⚠️ **옛 `focus`는 여전히 없다** (8-4) — 무시되고 기본 선택으로 떨어진다. **`state`는 2026-09-15에
 * 돌아왔다**: Home의 카운트 카드 넷이 여기로 착지한다 (`TranslationsQuery`의 주석에 뒤집은 근거가 있다).
 */
type Search = Raw<"ns" | "locales" | "q" | "state">;

export default async function TranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; surfaceSlug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug, surfaceSlug } = await params;
  const search = firstQueryValues(await searchParams);

  // ⚠️ **최상단에서 던진다.** 조건부 렌더로 막으면 App Router가 페이지를 이미 실행한 뒤라
  // RSC 페이로드에 키가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB). `redirect()`는 렌더를 중단한다.
  const { projectId, surfaceId, role, archived } = await requireSurfaceAccess({ slug, surfaceSlug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;

  const prisma = getPrisma();
  // ⚠️ **인가가 준 id로 읽는다 — URL의 slug로 다시 찾지 않는다.** 클라이언트가 준 식별자를 두 번
  // 믿지 않는 것이 이 규칙의 요지다 (ARCHITECTURE §6.00 ③). null은 인가와 조회 사이에 프로젝트가 사라진
  // 경우뿐이라 남겨 둔다.
  const project = await loadProject(prisma, projectId, surfaceId);
  if (!project) redirect(routes.projects());

  /**
   * 첫 적재 전에는 볼 것이 없다. **정책과 문구는 `ProjectNotReady`가 든다** — Home도 같은 갈래를
   * 만나고, 두 벌이면 정책이 바뀔 때 한쪽이 낡는다(그 낡음은 URL을 직접 친 사람에게만 보인다).
   */
  if (planProjectReadiness(project) !== "ready") return <ProjectNotReady slug={slug} role={role} />;

  // base를 맨 앞에 두고 나머지는 코드순. 원문이 위에 있어야 그 아래를 채운다.
  const columns = [...project.locales].sort((a, b) =>
    a.isBase === b.isBase ? (a.code < b.code ? -1 : 1) : a.isBase ? -1 : 1,
  );

  /**
   * ⚠️ **키만 먼저 읽는다 — 나머지 둘은 착지 redirect **뒤**다** (2026-09-12). 기본 착지는 URL을
   * 고정하려고 아래에서 `redirect`하는데, 그 판정에 필요한 것은 `rows` 하나다. 집계·편집자를 여기서
   * 함께 읽으면 **버려질 렌더가 그 둘까지 조회**하고, 사이드바에서 들어오는 가장 흔한 경로가 매번
   * 그 값을 문다 (PRODUCT의 2초 게이트가 재는 것이 그 경로다).
   */
  const rows = await loadKeys(prisma, project.id, surfaceId);

  /**
   * 보일 로케일. **폴백은 "살아 있는 로케일 전체"다** — orphaned를 섞으면 그 빈 셀이 전부
   * 미번역으로 잡혀 기본 착지가 행이 전부 disabled인 네임스페이스로 간다 (ARCHITECTURE §5.5.16).
   */
  const fallback = parseLocaleSelection(undefined, columns);
  const selected = parseLocaleSelection(search.locales, columns);
  const visibleLocales = columns.filter((locale) => selected.includes(locale.code));

  /**
   * ⚠️ **주소창 값이라 판정 함수로 거른다** — 모르는 값은 무시한다(404도 리다이렉트도 아니다).
   * 사전을 직접 인덱싱하면 `Object.prototype`에서 찾아진 값이 판정 자리에 온다 (POSTMORTEM 2026-09-08).
   */
  const state = isKeyState(search.state) ? search.state : undefined;

  const counts = namespaceCountsFor(rows, selected);
  const selection = resolveNamespace(search.ns, counts);

  /**
   * 기본 착지를 **URL에 고정한다** — 그 뒤로는 화면이 ns를 다시 고르지 않는다.
   *
   * ⚠️ **저장 재검증이 화면을 옮기는 것을 막는 것이 요지다.** `?ns=`가 없으면 매 렌더가
   * `defaultNamespace`를 다시 계산하는데, 한 셀을 채워 그 네임스페이스의 pending이 0이 되면
   * 다음 재검증이 **다른 네임스페이스로 착지해** 작성 중인 셀이 통째로 언마운트된다.
   *
   * ⚠️ **이 자리가 조회 둘보다 앞이어야 한다** (2026-09-12) — 버려질 렌더이므로 여기까지 온 비용이
   * 그대로 낭비다. 그래도 `loadKeys` 한 번은 못 피한다: 착지할 네임스페이스를 `counts`가 정하고
   * 그 출처가 `rows`다.
   */
  const normalizedLocales = search.locales === undefined ? undefined : selected.join(",") || undefined;
  const normalizedNs = selection.kind === "all" ? ALL_NAMESPACES : selection.kind === "one" ? selection.namespace : undefined;
  if (search.ns !== normalizedNs || search.locales !== normalizedLocales) {
    redirect(routes.surfaceTranslations(slug, surfaceSlug, { ns: normalizedNs, locales: normalizedLocales, q: search.q, state }));
  }

  const scoped = selection.kind === "one" ? rows.filter((r) => r.namespace === selection.namespace) : rows;
  /**
   * ⚠️ **상태 좁힘이 검색보다 앞이다** — 검색은 보이는 로케일의 값을 훑으므로 대상이 좁을수록 싸고,
   * 둘 다 순수 필터라 결과는 순서에 무관하다.
   */
  const narrowed = state === undefined ? scoped : filterByState(scoped, { state, locales: selected, lastPulledAt: project.lastPulledAt });
  const filtered = selection.kind === "none" ? [] : filterRows(narrowed, { locales: selected, q: search.q });
  /**
   * 섹션 안에서 남은 일이 위로 온다 (DESIGN §6.1 — 상태 필터를 뺀 대가를 갚는 유일한 수단이다).
   * **분할이 안정적이라** 그룹 안의 상대 순서가 그대로 보존되고, 그래서 그룹핑 전에 한 번만 한다.
   */
  const visible = pendingFirst(filtered, selected);
  const groups = groupByNamespace(visible, counts);

  /**
   * 편집자 이름은 왕복 하나로 받는다 — 행마다 조회하면 903키 리포에서 그만큼의 쿼리가 된다.
   * `updatedBy`를 그대로 찍으면 번역자에게 cuid가 보인다 (issue #3). **렌더되는 행만** 모은다.
   *
   * ⚠️ **미배포 집계와 병렬이다** — 위에서 `loadKeys`를 떼어내며 라운드가 하나 늘 뻔했다. 둘은
   * 서로를 안 물므로 같은 라운드에 보낸다.
   */
  const [unpublished, actors] = await Promise.all([
    countUnpublished(prisma, project.id),
    loadActors(prisma, collectActorIds(visible)),
  ]);

  /**
   * 링크·필터가 공유하는 현재 URL 상태. 하나를 바꿔도 나머지가 보존된다 (PRODUCT §7.7).
   *
   * 명시적 선택은 목적 표면의 전체 로케일과 같아도 보존한다 — 왕복 전환에서 선택이 넓어지면 안 된다.
   */
  const localesParam = search.locales === undefined ? undefined : selected.join(",") || undefined;
  const query: TranslationsQuery = {
    ns: selection.kind === "all" ? ALL_NAMESPACES : selection.kind === "one" ? selection.namespace : undefined,
    locales: localesParam,
    q: search.q,
    // ⚠️ **거른 값을 싣는다** — 원문을 실으면 모르는 값이 링크마다 되살아난다.
    state,
  };

  /**
   * 칩이 보는 쿼리 — **기본 착지의 네임스페이스를 싣지 않는다.**
   *
   * ⚠️ `query.ns`는 항상 **해석된** 값이라(툴바의 `Select`와 링크 보존이 그것을 필요로 한다) 그대로
   * 칩에 넘기면 아무것도 안 누른 사용자에게도 "Namespace: common ×"가 선다. 그 착지는 화면이 정한
   * 것이지 사용자가 고른 필터가 아니다 (6a T2).
   */
  const chipQuery: TranslationsQuery = { ...query, ns: search.ns === undefined ? undefined : query.ns };
  const surfaces = await Promise.all(project.surfaces.map(async s => ({ slug: s.slug, pathTemplate: s.pathTemplate,
    unpublished: await countUnpublished(prisma, projectId, s.id) })));

  return (
    // ⚠️ **무조건 렌더한다** — Publish 결과 Alert가 이 안에 있고, 조건부 분기에 두면
    // `router.refresh()`·`revalidatePath`가 방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07).
    <TranslationsHeader
      slug={slug}
      surfaceSlug={surfaceSlug}
      surfaces={surfaces}
      totalCount={rows.length}
      query={query}
      chipQuery={chipQuery}
      namespaces={counts.map((c) => ({
        namespace: c.namespace,
        pending: c.untranslated + c.needsReview,
        total: c.total,
      }))}
      locales={columns}
      selected={selected}
      fallback={fallback}
      unpublished={unpublished}
      /* ⚠️ **`syncBranchFor`를 서버가 부른다** — 그 모듈은 octokit·ts-morph를 물어 클라이언트가 물면 안 된다. */
      repo={{ owner: project.repoOwner, name: project.repoName, branch: project.baseBranch, syncBranch: syncBranchFor(slug) }}
      role={role}
      lastSentLabel={
        project.lastPublishedAt === null ? null : relativeTime(project.lastPublishedAt, new Date())
      }
      lastPrUrl={project.lastPrUrl}
      baseLocale={project.baseLocale}
      declaredBaseLocale={project.declaredBaseLocale}
    >
      {/*
        ⚠️ **빈 상태 둘이 패널 세로 중앙이다** (2026-09-11 — `/projects`와 같은 형). `PanelBody`가
        `flex flex-col`이고 여기가 `flex-1`이라 남은 높이를 먹는다. 위에 붙여 두면 1080 화면에서
        문구가 배너 바로 아래 한 줄로 떠 있고 그 아래가 통째로 빈다.
      */}
      {selection.kind === "none" ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Languages}
            title={m.translations.empty.noKeys.title}
            description={m.translations.empty.noKeys.description}
          />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Languages}
            title={m.translations.empty.noMatch.title}
            description={m.translations.empty.noMatch.description}
          />
        </div>
      ) : (
        /* ⚠️ live region은 **표 하나에 하나**다 — 셀마다 두면 903행×3로케일에 2,700개다 (DESIGN §7). */
        <Announcer>
          <div>
            {groups.map((group) => (
              <section key={group.namespace}>
                {/* 섹션 제목은 PanelBody에 붙는다. Table은 별도 스크롤 경계를 만들지 않는다. */}
                <div className="border-border bg-background sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-3">
                  <h2 id={`namespace-${encodeURIComponent(group.namespace)}`} className="text-sm font-medium">{group.namespace}</h2>
                  {/* 필터 **후** 건수다 — 제목 옆 총계가 필터 전이라 둘이 같은 값이 아니다. */}
                  <Badge variant="neutral">
                    <span aria-hidden>{group.rows.length}</span>
                    <span className="sr-only">{m.translations.keys(group.rows.length)}</span>
                  </Badge>
                </div>
                <Table scrollable={false} className="table-fixed" aria-labelledby={`namespace-${encodeURIComponent(group.namespace)}`}>
                  <colgroup><col className="w-80" /><col className="w-17" /><col /></colgroup>
                  <TableHeader className="sr-only">
                    <TableRow>
                      <TableHead scope="col">{m.translations.columns.key}</TableHead>
                      <TableHead scope="col">{m.translations.columns.locale}</TableHead>
                      <TableHead scope="col">{m.translations.columns.value}</TableHead>
                    </TableRow>
                  </TableHeader>
                  {group.rows.map((row) => (
                    <KeyGroup
                      key={row.id}
                      slug={slug}
                      surfaceSlug={surfaceSlug}
                      row={row}
                      locales={visibleLocales}
                      project={project}
                      actors={actors}
                    />
                  ))}
                </Table>
              </section>
            ))}
          </div>
        </Announcer>
      )}
    </TranslationsHeader>
  );
}
