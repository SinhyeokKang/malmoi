import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { loadKeys, loadProject } from "@/lib/keys/query";
import { buildPermalink, cellState, namespaceCounts, type KeyRow, type TranslationState } from "@/lib/keys/view";
import { cn } from "@/lib/utils";
import { TranslationInput } from "@/components/translation-input";

/**
 * 키 테이블 — `| key | en(base) | ko | fr |`. 원문과 번역을 나란히 본다 (MVP §3.2).
 *
 * **base 로케일도 편집 가능하다** — 고정된 것은 키뿐이다. 화면의 base 값은 `sourceText`가
 * 아니라 `cells[base]`이고, `sourceText`는 stale 판정 전용이다.
 *
 * 시각 규칙은 docs/DESIGN.md — 키는 mono(§4.1), 배지 3종(§6.2), muted 표면 대비(§2.2).
 */

type Search = { ns?: string; focus?: string };

export default async function KeysPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ns, focus } = await searchParams;
  const prisma = getPrisma();

  const project = await loadProject(prisma, requireEnv("ACTIVE_PROJECT_SLUG"));
  if (!project) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-destructive text-sm">
          프로젝트를 찾을 수 없다 — `ACTIVE_PROJECT_SLUG`를 확인한다.
        </p>
      </main>
    );
  }
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
              href={qs({ ns, focus: l.code })}
              className={cn("rounded px-1", l.code === focusLocale ? "text-foreground font-medium" : "hover:text-foreground")}
            >
              {l.code}
            </a>
          ))}
        </div>
        <nav className="pb-4">
          <NsLink href={qs({ focus })} active={ns === undefined} label="전체" total={rows.length}
            pending={counts.reduce((n, c) => n + c.untranslated + c.needsReview, 0)} />
          {counts.map((c) => (
            <NsLink key={c.namespace} href={qs({ ns: c.namespace, focus })} active={ns === c.namespace}
              label={c.namespace} total={c.total} pending={c.untranslated + c.needsReview} />
          ))}
        </nav>
      </aside>

      {/* ── 키 테이블 ─────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1">
        <div className="border-border flex items-center gap-3 border-b px-4 py-2">
          <span className="text-sm font-medium">{ns ?? "전체"}</span>
          <span className="text-muted-foreground text-xs">{visible.length}키</span>
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
function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) search.set(k, v);
  const s = search.toString();
  return s === "" ? "/keys" : `/keys?${s}`;
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
