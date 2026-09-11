import { Languages } from "lucide-react";
import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { PanelBody } from "@/components/shell/content-panel";
import { ProjectNotReady } from "@/components/project-not-ready";
import { Announcer } from "@/components/translations/announcer";
import { TranslationsHeader } from "@/components/translations/header";
import { KeyGroup } from "@/components/translations/key-group";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/relative-time";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { countUnpublished, loadActors, loadKeys, loadProject } from "@/lib/keys/query";
import {
  collectActorIds, filterRows, groupByNamespace, namespaceCountsFor,
  parseLocaleSelection, pendingFirst, resolveNamespace,
} from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { ALL_NAMESPACES, routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 번역 화면 — **키 하나가 한 그룹이고 로케일이 그 아래 행으로 쌓인다** (8-4, 시안 `212:937`).
 *
 * 로케일이 열이던 시절에는 로케일이 늘 때마다 가로가 늘어 6개에서 표가 화면을 넘었다. 행이 축이면
 * 그 문제가 사라지는 대신 세로가 로케일 배수로 는다 — ⚠️ **다만 `<Textarea>` 수는 그대로다**
 * (903키 × 3로케일 = 2,709). 늘어나는 것은 행 래퍼와 로케일 배지이고 입력보다 싸다 (design §5).
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
 * ⚠️ **`STALE_AFTER_SECONDS`(300)의 전제가 이 줄이다** (7단계 — sync-runs design §1.4). 없으면 이
 * 세그먼트가 프로젝트 기본값(300)을 쓰고, 그러면 stale 판정 창과 실행 상한이 **같아져** 정상 실행이
 * 스스로를 stale로 보고 두 번째 실행을 허용한다.
 */
export const maxDuration = 60;

/**
 * ⚠️ 이 타입이 URL 계약이다 — `entry-points.test.ts`가 `routes.translations`의 키와 대조한다.
 *
 * ⚠️ **옛 `focus`·`state`가 없다** (8-4). 옛 링크는 무시된다 — 기본 선택으로 떨어질 뿐 404도
 * 리다이렉트도 아니다.
 */
type Search = { ns?: string; locales?: string; q?: string };

export default async function TranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const search = await searchParams;

  // ⚠️ **최상단에서 던진다.** 조건부 렌더로 막으면 App Router가 페이지를 이미 실행한 뒤라
  // RSC 페이로드에 키가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB). `redirect()`는 렌더를 중단한다.
  const { projectId, role, archived } = await requireProjectAccess({ slug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;

  const prisma = getPrisma();
  // ⚠️ **인가가 준 id로 읽는다 — URL의 slug로 다시 찾지 않는다.** 클라이언트가 준 식별자를 두 번
  // 믿지 않는 것이 이 규칙의 요지다 (SAAS §5.2). null은 인가와 조회 사이에 프로젝트가 사라진
  // 경우뿐이라 남겨 둔다.
  const project = await loadProject(prisma, projectId);
  if (!project) redirect(routes.projects());

  /**
   * 첫 적재 전에는 볼 것이 없다. **정책과 문구는 `ProjectNotReady`가 든다** — Home도 같은 갈래를
   * 만나고, 두 벌이면 정책이 바뀔 때 한쪽이 낡는다(그 낡음은 URL을 직접 친 사람에게만 보인다).
   */
  if (planProjectReadiness(project) !== "ready") return <ProjectNotReady slug={slug} role={role} />;

  if (project.locales.length === 0) {
    return (
      <Centered>
        <EmptyState
          icon={Languages}
          title={m.translations.empty.noLocales.title}
          description={m.translations.empty.noLocales.description}
        />
      </Centered>
    );
  }

  // base를 맨 앞에 두고 나머지는 코드순. 원문이 위에 있어야 그 아래를 채운다 (MVP §3.2).
  const columns = [...project.locales].sort((a, b) =>
    a.isBase === b.isBase ? (a.code < b.code ? -1 : 1) : a.isBase ? -1 : 1,
  );

  const [rows, unpublished] = await Promise.all([
    loadKeys(prisma, project.id),
    countUnpublished(prisma, project.id, project.lastPulledAt),
  ]);

  /**
   * 보일 로케일. **폴백은 "살아 있는 로케일 전체"다** — orphaned를 섞으면 그 빈 셀이 전부
   * 미번역으로 잡혀 기본 착지가 행이 전부 disabled인 네임스페이스로 간다 (design §3.1).
   */
  const fallback = parseLocaleSelection(undefined, columns);
  const selected = parseLocaleSelection(search.locales, columns);
  const visibleLocales = columns.filter((locale) => selected.includes(locale.code));

  const counts = namespaceCountsFor(rows, selected);
  const selection = resolveNamespace(search.ns, counts);

  // 최초 착지만 자동 선택한다. 저장 재검증이 다른 네임스페이스로 이동해 작성 중인 셀을 지우면 안 된다.
  if (selection.kind === "one" && search.ns !== selection.namespace) {
    redirect(routes.translations(slug, { ns: selection.namespace, locales: search.locales, q: search.q }));
  }

  const scoped = selection.kind === "one" ? rows.filter((r) => r.namespace === selection.namespace) : rows;
  const filtered = selection.kind === "none" ? [] : filterRows(scoped, { locales: selected, q: search.q });
  /**
   * 섹션 안에서 남은 일이 위로 온다 (spec Q3 — 상태 필터를 뺀 대가를 갚는 유일한 수단이다).
   * **분할이 안정적이라** 그룹 안의 상대 순서가 그대로 보존되고, 그래서 그룹핑 전에 한 번만 한다.
   */
  const visible = pendingFirst(filtered, selected);
  const groups = groupByNamespace(visible, counts);

  // 편집자 이름은 왕복 하나로 받는다 — 행마다 조회하면 903키 리포에서 그만큼의 쿼리가 된다.
  // `updatedBy`를 그대로 찍으면 번역자에게 cuid가 보인다 (issue #3). **렌더되는 행만** 모은다.
  const actors = await loadActors(prisma, collectActorIds(visible));

  /**
   * 링크·필터가 공유하는 현재 URL 상태. 하나를 바꿔도 나머지가 보존된다 (design §2).
   *
   * ⚠️ **선택이 기본과 같으면 `locales`를 안 싣는다** — 둘 다 `columns` 순서라 문자열 비교로
   * 정확히 같다. 안 그러면 아무것도 안 고른 사용자의 URL에도 파라미터가 붙는다.
   */
  const localesParam = selected.join(",") === fallback.join(",") ? undefined : selected.join(",");
  const query: TranslationsQuery = {
    ns: selection.kind === "all" ? ALL_NAMESPACES : selection.kind === "one" ? selection.namespace : undefined,
    locales: localesParam,
    q: search.q,
  };

  /**
   * 칩이 보는 쿼리 — **기본 착지의 네임스페이스를 싣지 않는다.**
   *
   * ⚠️ `query.ns`는 항상 **해석된** 값이라(툴바의 `Select`와 링크 보존이 그것을 필요로 한다) 그대로
   * 칩에 넘기면 아무것도 안 누른 사용자에게도 "Namespace: common ×"가 선다. 그 착지는 화면이 정한
   * 것이지 사용자가 고른 필터가 아니다 (6a T2).
   */
  const chipQuery: TranslationsQuery = { ...query, ns: search.ns === undefined ? undefined : query.ns };

  return (
    // ⚠️ **무조건 렌더한다** — Publish 결과 Alert가 이 안에 있고, 조건부 분기에 두면
    // `router.refresh()`·`revalidatePath`가 방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07).
    <TranslationsHeader
      slug={slug}
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
      lastSentLabel={
        project.lastPublishedAt === null ? null : relativeTime(project.lastPublishedAt, new Date())
      }
      lastPrUrl={project.lastPrUrl}
      dismissKey={project.lastPulledAt?.toISOString() ?? "never"}
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
        /* ⚠️ live region은 **표 하나에 하나**다 — 셀마다 두면 903행×3로케일에 2,700개다 (design §3.8). */
        <Announcer>
          <div>
            {groups.map((group) => (
              <section key={group.namespace}>
                {/*
                  ⚠️ **실제 `<h2>`여야 한다** — `div` + `grid`로 가면서 네임스페이스 간 이동이
                  스크린리더의 heading 탐색으로만 가능해졌다 (design §1.5).
                  ⚠️ **sticky로 만들지 않는다** — 시안이 스크롤 영역 안의 보통 블록이고, sticky는
                  스크롤 컨테이너 기준이라 이 레이아웃에서 자리가 애매하다. 필요해지면 실측 뒤에.
                */}
                {/*
                  ⚠️ **헤딩이 표의 첫 행이다 — 표를 감싸는 상자가 없다** (2026-09-11 — 시안
                  `212:3815`). 전에는 `rounded-lg border` 상자에 표를 넣고 헤딩을 그 **위에** 띄웠는데,
                  시안의 표는 **선만으로** 구조를 만든다: 바깥 테두리가 없고 헤딩 아래·키 그룹 사이의
                  가로선과 키 셀의 세로선이 전부다. 상자를 두면 그 선들이 격자 안의 격자가 된다.

                  ⚠️ **`px-2`가 키 셀과 같은 선이다** — 헤딩과 키 이름의 왼쪽이 맞아야 네임스페이스가
                  그 아래 키들을 덮는 것으로 읽힌다.

                  ⚠️ **`sticky top-0`이다** (2026-09-11 사용자 — DESIGN §6.1의 "sticky로 만들지
                  않는다"를 뒤집었다). 그 판정의 근거는 *"sticky는 스크롤 컨테이너 기준이라 이
                  레이아웃에서 자리가 애매하다"*였는데, 스크롤 경계가 `PanelBody` **하나로** 분명해진
                  지금은 기준이 애매하지 않다 — 가장 가까운 스크롤 조상이 그것이고 `top-0`이 그
                  상단이다. 섹션이 위로 빠져나가면 **다음 섹션의 헤딩이 밀어 올려 교체된다**(sticky의
                  기본 동작이라 JS가 없다).

                  ⚠️ **`bg-background`가 없으면 표 행이 헤딩을 뚫고 지나간다** — 붙어 있는 동안 뒤로
                  값이 흐르는 자리다. 패널과 같은 흰색이라 색이 늘지 않는다.

                  셀 상태 표시가 relative/absolute이므로 헤딩을 z-10으로 올린다.
                  같은 층이면 뒤에 렌더된 셀이 sticky 제목 위에 칠해진다.
                */}
                <div className="border-border bg-background sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-3">
                  <h2 className="text-sm font-medium">{group.namespace}</h2>
                  {/* 필터 **후** 건수다 — 제목 옆 총계가 필터 전이라 둘이 같은 값이 아니다. */}
                  <Badge variant="neutral">
                    <span aria-hidden>{group.rows.length}</span>
                    <span className="sr-only">{m.translations.keys(group.rows.length)}</span>
                  </Badge>
                </div>
                {group.rows.map((row) => (
                  <KeyGroup
                    key={row.id}
                    slug={slug}
                    row={row}
                    locales={visibleLocales}
                    project={project}
                    actors={actors}
                    lastPulledAt={project.lastPulledAt}
                  />
                ))}
              </section>
            ))}
          </div>
        </Announcer>
      )}
    </TranslationsHeader>
  );
}

/**
 * 표가 없는 화면(빈 상태 셋)의 자리. 셸 안 `limited` 폭이다 (DESIGN §5.1).
 *
 * ⚠️ **`<main>`이 아니라 `PanelBody`다** (2026-09-11) — 랜드마크는 `ContentPanel`이 들고, 여기가
 * 드는 것은 **스크롤 경계**다. `max-w-4xl`은 안쪽 `div`가 든다(`PanelBody`에 주면 스크롤 컨테이너가
 * 좁아져 스크롤바가 콘텐츠 옆에 생긴다).
 */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <PanelBody className="flex flex-col">
      {/* ⚠️ 세로 중앙도 `flex-1`이 든다 — 위 표 안의 빈 상태 둘과 같은 형이다 (2026-09-11). */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-6">
        {children}
      </div>
    </PanelBody>
  );
}
