import { ExternalLink, Languages } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectNotReady } from "@/components/project-not-ready";
import { Announcer } from "@/components/translations/announcer";
import { TranslationsHeader } from "@/components/translations/header";
import { TranslationInput } from "@/components/translation-input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { relativeTime } from "@/lib/relative-time";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { countUnpublished, loadActors, loadKeys, loadProject, type ProjectContext } from "@/lib/keys/query";
import {
  ALL_NAMESPACES, actorLabel, buildPermalink, cellState, collectActorIds, filterRows,
  isUnpublished, namespaceCounts, resolveNamespace,
  type KeyRow, type NamespaceCount, type TranslationState,
} from "@/lib/keys/view";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { routes, type TranslationsQuery } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * 키 테이블 — `| Key | en(base) | ko | fr |`. 원문과 번역을 나란히 본다 (MVP §3.2).
 *
 * **base 로케일도 편집 가능하다** — 고정된 것은 키뿐이다. 화면의 base 값은 `StringKey.sourceText`가
 * 아니라 `cells[base]`다. ⚠️ **`sourceText`는 이 화면에 실리지 않는다** (2026-09-04 audit #47):
 * 행마다 나르면서 읽는 코드가 없었고, stale은 push가 세우는 `needsReview`가 든다.
 *
 * ⚠️ **기본 착지는 "남은 일이 있는" 첫 네임스페이스다** (design §3.3). 필터 없는 903키 렌더가
 * 12.7초였고(2026-09-07 실측) 원인은 조회가 아니라 `<input>` 2,711개였다 — 서버는 여전히 전 키를
 * 읽고(패널 집계에 필요하다) **렌더되는 행만** 표에 준다.
 *
 * 시각 규칙은 docs/DESIGN.md — 키는 mono(§4.1), 배지 3종(§6.2), muted 표면 대비(§2.2).
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

/** ⚠️ 이 타입이 URL 계약이다 — `entry-points.test.ts`가 `routes.translations`의 키와 대조한다. */
type Search = { ns?: string; focus?: string; q?: string; state?: string };

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
  const { projectId, role } = await requireProjectAccess({ slug, permission: "translation:write" });

  const prisma = getPrisma();
  // ⚠️ **인가가 준 id로 읽는다 — URL의 slug로 다시 찾지 않는다.** 클라이언트가 준 식별자를 두 번
  // 믿지 않는 것이 이 규칙의 요지다 (SAAS §5.2). null은 인가와 조회 사이에 프로젝트가 사라진
  // 경우뿐이라 남겨 둔다.
  const project = await loadProject(prisma, projectId);
  if (!project) redirect(routes.projects());

  /**
   * 첫 적재 전에는 볼 것이 없다 (design §3.7). **정책과 문구는 `ProjectNotReady`가 든다** — Home도
   * 같은 갈래를 만나고, 두 벌이면 정책이 바뀔 때 한쪽이 낡는다(그 낡음은 URL을 직접 친 사람에게만
   * 보인다). 6b-6이 그 사본을 만들었고 같은 사이클이 합쳤다.
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

  // base를 맨 앞에 두고 나머지는 코드순. 원문이 왼쪽에 있어야 번역을 채우기 쉽다.
  const columns = [...project.locales].sort((a, b) =>
    a.isBase === b.isBase ? (a.code < b.code ? -1 : 1) : a.isBase ? -1 : 1,
  );

  const [rows, unpublished] = await Promise.all([
    loadKeys(prisma, project.id),
    countUnpublished(prisma, project.id, project.lastPulledAt),
  ]);

  // 집계 기준 로케일. base는 대개 채워져 있어 "남은 일"이 안 보이므로 base가 아닌 첫 로케일이
  // 기본이다. `?focus=`로 바꾼다 — 없는 코드가 오면 그 기본으로 떨어진다(404가 아니다).
  const focus = columns.find((l) => l.code === search.focus)?.code
    ?? columns.find((l) => !l.isBase)?.code
    ?? columns[0]!.code;

  const counts = namespaceCounts(rows, focus);
  const selection = resolveNamespace(search.ns, counts);
  // 주소창 값이라 union으로 좁힌다 — 모르는 값은 필터 없음이다.
  const state = search.state === "needs-review" || search.state === "untranslated" ? search.state : undefined;

  const scoped = selection.kind === "one" ? rows.filter((r) => r.namespace === selection.namespace) : rows;
  const visible = selection.kind === "none" ? [] : filterRows(scoped, { locale: focus, q: search.q, state });

  // 편집자 이름은 왕복 하나로 받는다 — 행마다 조회하면 903키 리포에서 그만큼의 쿼리가 된다.
  // `updatedBy`를 그대로 찍으면 번역자에게 cuid가 보인다 (issue #3). **렌더되는 행만** 모은다.
  const actors = await loadActors(prisma, collectActorIds(visible));

  /** 링크·필터가 공유하는 현재 URL 상태. 하나를 바꿔도 나머지가 보존된다. */
  const query: TranslationsQuery = {
    ns: selection.kind === "all" ? ALL_NAMESPACES : selection.kind === "one" ? selection.namespace : undefined,
    focus,
    q: search.q,
    state,
  };

  return (
    // 헤더 높이를 계산하지 않는다 — 레이아웃이 flex로 남은 높이를 준다.
    // ⚠️ `overflow-hidden`이 있어야 패널과 표가 **각자** 스크롤한다 (없으면 컨테이너가 콘텐츠만큼
    // 자라 패널이 표와 함께 흘러간다 — 6a 전까지 그랬다).
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {counts.length > 0 && (
        <NamespacePanel slug={slug} counts={counts} total={rows.length} selection={selection} query={query} />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ⚠️ **무조건 렌더한다** — Publish 결과 Alert가 이 안에 있고, 조건부 분기에 두면
            `router.refresh()`·`revalidatePath`가 방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07). */}
        <TranslationsHeader
          slug={slug}
          projectName={project.name}
          namespaceLabel={selection.kind === "one" ? selection.namespace : m.translations.allKeys}
          visibleCount={visible.length}
          locales={columns.map((l) => l.code)}
          query={query}
          unpublished={unpublished}
          lastSentLabel={
            project.lastPublishedAt === null ? null : relativeTime(project.lastPublishedAt, new Date())
          }
          lastPrUrl={project.lastPrUrl}
          dismissKey={project.lastPulledAt?.toISOString() ?? "never"}
          baseLocale={project.baseLocale}
          declaredBaseLocale={project.declaredBaseLocale}
        />

        <div className="min-h-0 flex-1">
          {selection.kind === "none" ? (
            <EmptyState
              icon={Languages}
              title={m.translations.empty.noKeys.title}
              description={m.translations.empty.noKeys.description}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Languages}
              title={m.translations.empty.noMatch.title}
              description={m.translations.empty.noMatch.description}
            />
          ) : (
            /* ⚠️ live region은 **표 하나에 하나**다 — 셀마다 두면 903행×3로케일에 2,700개다 (design §3.8). */
            <Announcer>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-[28%] text-xs">{m.translations.columnKey}</Th>
                    {columns.map((l) => (
                      <Th key={l.code} className="text-xs">
                        {l.code}
                        {/* muted 표면 위라 text-muted-foreground가 아니다 (DESIGN §2.2·§6.1) */}
                        {l.isBase && <span className="font-normal"> {m.translations.baseColumn}</span>}
                        {/* 키의 orphaned 배지와 같은 어휘 — 이 열은 편집이 막힌다. 저장을 받아도 pull이 파일을 내지 않는다. */}
                        {l.orphaned && (
                          <Badge variant="danger" className="ml-1 font-normal">
                            {m.translations.orphaned}
                          </Badge>
                        )}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-mono min-w-0 break-all">{row.key}</span>
                          {row.orphaned && (
                            <Badge variant="danger" className="shrink-0">
                              {m.translations.orphaned}
                            </Badge>
                          )}
                        </div>
                        {row.description !== null && row.description !== undefined && (
                          <div className="text-muted-foreground mt-0.5 text-xs">{row.description}</div>
                        )}
                        <CodeRef row={row} project={project} />
                      </Td>
                      {columns.map((l) => (
                        <Td key={l.code}>
                          <TranslationInput
                            slug={slug}
                            keyId={row.id}
                            keyName={row.key}
                            localeCode={l.code}
                            initialValue={row.cells[l.code]?.value ?? ""}
                            disabled={row.orphaned || l.orphaned}
                          />
                          <CellMeta
                            state={cellState(row, l.code)}
                            actor={actorLabel(row.cells[l.code]?.updatedBy ?? null, actors)}
                            unsent={unsentCell(row, l.code, project.lastPulledAt)}
                          />
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Announcer>
          )}
        </div>
      </div>
    </div>
  );
}

/** 표가 없는 화면(빈 상태 셋)의 자리. 셸 안 `limited` 폭이다 (DESIGN §5.1). */
function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-4xl px-6 py-6">{children}</main>;
}

/** 셀이 "아직 안 보낸 편집"인가 — `countUnpublished`와 **같은 술어**다 (design §3.5). */
function unsentCell(row: KeyRow, locale: string, lastPulledAt: Date | null): boolean {
  const cell = row.cells[locale];
  return cell !== undefined && isUnpublished(cell, lastPulledAt);
}

function CodeRef({ row, project }: { row: KeyRow; project: ProjectContext }) {
  const ref = row.refs[0];
  if (!ref) return null;
  const link = buildPermalink(project, ref);
  if (!link) return null;
  return (
    // 리포 밖으로 나가는 링크는 색·밑줄 + `ExternalLink` 12 (DESIGN §6.3)
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      className="mt-0.5 inline-flex items-baseline gap-1 text-xs text-blue-600 underline"
    >
      {ref.path.split("/").pop()}:{ref.line}
      {row.refs.length > 1 && ` +${row.refs.length - 1}`}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

/**
 * DESIGN §6.2 — 배지 3종. **"Translated"는 표시하지 않는다**(가장 흔한 상태가 조용해야 한다).
 *
 * ⚠️ **`updatedBy`가 아니라 해석된 라벨을 받는다** — 그 컬럼은 `User.id`와 옛 GitHub 핸들이 섞여
 * 있어 그대로 찍으면 번역자에게 cuid가 보인다 (malmoi#3). push가 덮은 셀은 저자가 리포이므로
 * 표기가 없다 (design §3.6).
 */
function CellMeta({
  state,
  actor,
  unsent,
}: {
  state: TranslationState;
  actor: string | null;
  unsent: boolean;
}) {
  if (state === "orphaned") return null; // 키 열·로케일 헤더에 이미 표시했다
  if (state === "translated" && actor === null && !unsent) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5 text-xs">
      {state === "needsReview" && <Badge variant="warning">{m.translations.needsReview}</Badge>}
      {state === "untranslated" && <Badge>{m.translations.untranslated}</Badge>}
      {unsent && <Badge>{m.translations.notSent}</Badge>}
      {actor !== null && <span className="text-muted-foreground">{m.translations.editedBy(actor)}</span>}
    </div>
  );
}

/**
 * 네임스페이스 패널. **"All keys" 행에도 `pending/total`이 있다** — 전역 잔여량이 보여야 편집자가
 * 다음에 어디로 갈지 안다 (design §3.3).
 *
 * ⚠️ **경로를 조립하지 않는다** — `lib/routes.ts` 한 곳이다. 2026-09-05에 이 패널의 링크 생성기가
 * 옛 경로를 하드코딩한 채 남아 전부 404였고 타입도 테스트도 그걸 못 봤다 (POSTMORTEM).
 */
function NamespacePanel({
  slug,
  counts,
  total,
  selection,
  query,
}: {
  slug: string;
  counts: NamespaceCount[];
  total: number;
  selection: { kind: "all" } | { kind: "one"; namespace: string } | { kind: "none" };
  query: TranslationsQuery;
}) {
  const pendingAll = counts.reduce((n, c) => n + c.untranslated + c.needsReview, 0);
  return (
    // 자기 안에서만 스크롤한다 — 콘텐츠와 함께 흘러가면 52개 네임스페이스에서 목록이 화면을 떠난다
    <aside className="border-border w-52 shrink-0 overflow-y-auto border-r py-2">
      <NsLink
        href={routes.translations(slug, { ...query, ns: ALL_NAMESPACES })}
        active={selection.kind === "all"}
        label={m.translations.allKeys}
        total={total}
        pending={pendingAll}
      />
      {counts.map((c) => (
        <NsLink
          key={c.namespace}
          href={routes.translations(slug, { ...query, ns: c.namespace })}
          active={selection.kind === "one" && selection.namespace === c.namespace}
          label={c.namespace}
          total={c.total}
          pending={c.untranslated + c.needsReview}
        />
      ))}
    </aside>
  );
}

function NsLink({ href, active, label, total, pending }: {
  href: string; active: boolean; label: string; total: number; pending: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-baseline gap-2 px-3 py-1.5 text-sm",
        // ⚠️ 선택 항목은 muted 알약이라 그 위 글자는 `text-muted-foreground`가 아니다 (DESIGN §2.2),
        // 그리고 muted 위에서는 `hover:bg-accent`가 무효다 (§2.1) — 링에 offset을 덧댄다.
        "focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-[3px] focus-visible:outline-none",
        active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("ml-auto shrink-0 text-xs", active && "text-foreground/60")}>
        {pending > 0 ? `${pending}/${total}` : total}
      </span>
    </Link>
  );
}
