import { requireProjectAccess } from "@/lib/auth/session";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db";
import { loadKeys, loadProject } from "@/lib/keys/query";
import { buildPermalink, cellState, namespaceCounts, type KeyRow, type TranslationState } from "@/lib/keys/view";
import { cn } from "@/lib/utils";
import { InviteForm } from "@/components/invite-form";
import { PullButton } from "@/components/pull-button";
import { TranslationInput } from "@/components/translation-input";

/**
 * 키 테이블 — `| key | en(base) | ko | fr |`. 원문과 번역을 나란히 본다 (MVP §3.2).
 *
 * **base 로케일도 편집 가능하다** — 고정된 것은 키뿐이다. 화면의 base 값은 `StringKey.sourceText`가
 * 아니라 `cells[base]`다. ⚠️ **`sourceText`는 이 화면에 실리지 않는다** (2026-09-04 audit #47):
 * 행마다 나르면서 읽는 코드가 없었고, stale은 push가 세우는 `needsReview`가 든다. 원문 대조를
 * 화면에 넣으려면 그때 다시 싣는다.
 *
 * 시각 규칙은 docs/DESIGN.md — 키는 mono(§4.1), 배지 3종(§6.2), muted 표면 대비(§2.2).
 */

type Search = { ns?: string; focus?: string };

export default async function TranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const { ns, focus } = await searchParams;

  // ⚠️ **최상단에서 던진다.** 조건부 렌더로 막으면 App Router가 페이지를 이미 실행한 뒤라
  // RSC 페이로드에 키가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB). `redirect()`는 렌더를 중단한다.
  const { projectId, role } = await requireProjectAccess({ slug, permission: "translation:write" });

  const prisma = getPrisma();
  // ⚠️ **인가가 준 id로 읽는다 — URL의 slug로 다시 찾지 않는다.** 클라이언트가 준 식별자를 두 번
  // 믿지 않는 것이 이 규칙의 요지다 (SAAS §5.2). null은 인가와 조회 사이에 프로젝트가 사라진
  // 경우뿐이라 남겨 둔다.
  const project = await loadProject(prisma, projectId);
  if (!project) redirect("/projects");
  if (project.locales.length === 0) {
    return (
      <main className="mx-auto max-w-2xl space-y-2 p-8">
        <p className="text-sm">로케일이 없다.</p>
        <p className="text-muted-foreground text-xs">push가 아직 적재하지 않았다.</p>
      </main>
    );
  }

  // base를 맨 앞에 두고 나머지는 코드순. 원문이 왼쪽에 있어야 번역을 채우기 쉽다.
  const columns = [...project.locales].sort((a, b) =>
    a.isBase === b.isBase ? (a.code < b.code ? -1 : 1) : a.isBase ? -1 : 1,
  );
  const rows = await loadKeys(prisma, project.id);

  // 사이드바 집계 기준 로케일. base는 대개 채워져 있어 "남은 일"이 안 보이므로 base가 아닌
  // 첫 로케일을 기본으로 쓴다. `?focus=`로 바꾼다.
  const focusLocale = columns.find((l) => l.code === focus)?.code
    ?? columns.find((l) => !l.isBase)?.code
    ?? columns[0]!.code;

  // 사이드바 링크의 base — 같은 화면 안에서 필터만 바꾼다.
  const base = `/projects/${slug}/translations`;
  const counts = namespaceCounts(rows, focusLocale);
  const visible = ns === undefined ? rows : rows.filter((r) => r.namespace === ns);

  return (
    // 헤더 높이를 계산하지 않는다 — 레이아웃이 flex로 남은 높이를 준다
    <div className="flex min-h-0 flex-1">
      {/* ── 네임스페이스 사이드바 ─────────────────────────────────────── */}
      <aside className="border-border w-52 shrink-0 overflow-y-auto border-r">
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {project.name} · {rows.length}키
        </div>
        <div className="text-muted-foreground border-border flex items-baseline gap-1 border-y px-3 py-1.5 text-xs">
          <span>기준</span>
          {columns.map((l) => (
            <a
              key={l.code}
              href={qs(base, { ns, focus: l.code })}
              className={cn("rounded px-1", l.code === focusLocale ? "text-foreground font-medium" : "hover:text-foreground")}
            >
              {l.code}
            </a>
          ))}
        </div>
        <nav className="pb-4">
          <NsLink href={qs(base, { focus })} active={ns === undefined} label="전체" total={rows.length}
            pending={counts.reduce((n, c) => n + c.untranslated + c.needsReview, 0)} />
          {counts.map((c) => (
            <NsLink key={c.namespace} href={qs(base, { ns: c.namespace, focus })} active={ns === c.namespace}
              label={c.namespace} total={c.total} pending={c.untranslated + c.needsReview} />
          ))}
        </nav>
      </aside>

      {/* ── 키 테이블 ─────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1">
        <div className="border-border flex items-center gap-3 border-b px-4 py-2">
          <span className="text-sm font-medium">{ns ?? "전체"}</span>
          <span className="text-muted-foreground text-xs">{visible.length}키</span>
          {/* Publish는 프로젝트에 속한 조작이라 레이아웃이 아니라 이 화면이 든다 — 레이아웃엔
              slug가 없다(`/projects` 목록도 같은 레이아웃을 쓴다). */}
          {/* 초대는 OWNER만 — 화면에서 감추는 것은 편의이고, 실제 방어는 `createInvitation`의
              `member:manage` 판정이다 (SAAS §5.2 — 클라이언트가 보낸 것을 믿지 않는다). */}
          {role === "OWNER" && (
            <div className="ml-auto">
              <InviteForm slug={slug} />
            </div>
          )}
          <div className={role === "OWNER" ? "" : "ml-auto"}>
            <PullButton slug={slug} />
          </div>
        </div>

        {/* 넓은 표는 자기 컨테이너 안에서만 스크롤한다 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-muted/50 border-border sticky top-0 border-b">
              <tr>
                <th className="text-foreground/60 w-[28%] px-3 py-2 text-xs font-medium">key</th>
                {columns.map((l) => (
                  <th key={l.code} className="text-foreground/60 px-3 py-2 text-xs font-medium">
                    {l.code}
                    {l.isBase && <span className="text-muted-foreground ml-1 font-normal">(base)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {visible.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-mono min-w-0 break-all">{row.key}</span>
                      {row.orphaned && <span className="text-destructive shrink-0 text-xs">orphaned</span>}
                    </div>
                    {row.description && (
                      <div className="text-muted-foreground mt-0.5 text-xs">{row.description}</div>
                    )}
                    <CodeRef row={row} project={project} />
                  </td>
                  {columns.map((l) => (
                    <td key={l.code} className="px-3 py-2">
                      <TranslationInput
                        slug={slug}
                        keyId={row.id}
                        localeCode={l.code}
                        initialValue={row.cells[l.code]?.value ?? ""}
                        disabled={row.orphaned}
                      />
                      <CellMeta state={cellState(row, l.code)} updatedBy={row.cells[l.code]?.updatedBy ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visible.length === 0 && (
          <p className="text-muted-foreground p-8 text-sm">이 네임스페이스에 키가 없다.</p>
        )}
      </main>
    </div>
  );
}

/** 쿼리스트링 조립 — undefined는 빼서 URL이 깔끔하게 유지된다. */
/**
 * 사이드바 링크. **base 경로를 인자로 받는다** — 하드코딩하면 라우트를 옮길 때 여기만 남는다.
 * 2026-09-05에 `/keys` → `/projects/[slug]/translations` 이관에서 실제로 그렇게 남아 사이드바가
 * 전부 404로 갔고, **타입도 테스트도 그걸 못 봤다**(문자열이고 페이지 렌더 테스트가 없다).
 * `app/__tests__/entry-points.test.ts`의 "죽은 라우트 링크"가 그 자리를 지금은 지킨다.
 */
function qs(base: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) search.set(k, v);
  const s = search.toString();
  return s === "" ? base : `${base}?${s}`;
}

function CodeRef({ row, project }: { row: KeyRow; project: Parameters<typeof buildPermalink>[0] }) {
  const ref = row.refs[0];
  if (!ref) return null;
  const link = buildPermalink(project, ref);
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noreferrer" className="mt-0.5 block text-xs text-blue-600 underline">
      {ref.path.split("/").pop()}:{ref.line}
      {row.refs.length > 1 && ` +${row.refs.length - 1}`}
    </a>
  );
}

/** DESIGN.md §6.2 — 배지 3종. 번역됨은 표시하지 않는다(가장 흔한 상태가 조용해야 한다). */
function CellMeta({ state, updatedBy }: { state: TranslationState; updatedBy: string | null }) {
  if (state === "orphaned") return null; // 키 열에 이미 표시했다
  return (
    <div className="mt-0.5 flex items-baseline gap-1.5 text-xs">
      {state === "needsReview" && (
        <span className="rounded bg-amber-100/80 px-1.5 py-0.5 text-amber-800">검토필요</span>
      )}
      {state === "untranslated" && <span className="text-muted-foreground">미번역</span>}
      {updatedBy && <span className="text-muted-foreground">— {updatedBy}</span>}
    </div>
  );
}

function NsLink({ href, active, label, total, pending }: {
  href: string; active: boolean; label: string; total: number; pending: number;
}) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-baseline gap-2 px-3 py-1.5 text-sm",
        // ⚠️ muted 표면 위에서는 hover:bg-accent가 무효다 (DESIGN.md §2.1).
        active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("ml-auto shrink-0 text-xs", active && "text-foreground/60")}>
        {pending > 0 ? `${pending}/${total}` : total}
      </span>
    </a>
  );
}
