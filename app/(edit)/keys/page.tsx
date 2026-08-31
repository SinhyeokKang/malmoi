import { auth } from "@/auth";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { loadKeys, loadProject } from "@/lib/keys/query";
import { buildPermalink, namespaceCounts, translationState } from "@/lib/keys/view";
import { cn } from "@/lib/utils";
import { TranslationInput } from "@/components/translation-input";

/**
 * 키 리스트 — 네임스페이스 사이드바 + 키 행.
 *
 * 인라인 편집은 `TranslationInput`(클라이언트 컴포넌트)이 맡고, 저장은 `actions.ts`의
 * Server Action 하나뿐이다 — **MVP의 유일한 사용자 mutation** (MVP §3.2).
 * 시각 규칙은 docs/DESIGN.md — 특히 §4.1(키는 mono)·§6.2(배지 3종)·§2.2(muted 표면 대비).
 */

type Search = { ns?: string; locale?: string };

export default async function KeysPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ns, locale } = await searchParams;
  const session = await auth();
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

  // 편집 대상은 base가 아닌 로케일이다 — base는 원문 자체라 편집할 것이 없다.
  const editable = project.locales.filter((l) => !l.isBase);
  const active = editable.find((l) => l.code === locale) ?? editable[0];

  if (!active) {
    return (
      <main className="mx-auto max-w-2xl space-y-2 p-8">
        <p className="text-sm">편집할 로케일이 없다.</p>
        <p className="text-muted-foreground text-xs">
          push가 로케일을 적재하지 않았거나 base 로케일 하나뿐이다.
        </p>
      </main>
    );
  }

  const rows = await loadKeys(prisma, project.id, active.code);
  const counts = namespaceCounts(rows);
  const visible = ns === undefined ? rows : rows.filter((r) => r.namespace === ns);

  return (
    <div className="flex min-h-[calc(100svh-2.5rem)]">
      {/* ── 네임스페이스 사이드바 ─────────────────────────────────────── */}
      <aside className="border-border w-56 shrink-0 overflow-y-auto border-r">
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {project.name} · {rows.length}키
        </div>
        <nav className="pb-4">
          <NsLink
            href={qs({ locale: active.code })}
            active={ns === undefined}
            label="전체"
            total={rows.length}
            pending={counts.reduce((n, c) => n + c.untranslated + c.needsReview, 0)}
          />
          {counts.map((c) => (
            <NsLink
              key={c.namespace}
              href={qs({ ns: c.namespace, locale: active.code })}
              active={ns === c.namespace}
              label={c.namespace}
              total={c.total}
              pending={c.untranslated + c.needsReview}
            />
          ))}
        </nav>
      </aside>

      {/* ── 키 리스트 ─────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="border-border flex items-center gap-3 border-b px-4 py-2">
          <span className="text-sm font-medium">{ns ?? "전체"}</span>
          <span className="text-muted-foreground text-xs">{visible.length}키</span>
          <div className="ml-auto flex gap-1">
            {editable.map((l) => (
              <a
                key={l.code}
                href={qs({ ns, locale: l.code })}
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  l.code === active.code
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.code}
              </a>
            ))}
          </div>
        </div>

        <ul className="divide-border divide-y">
          {visible.map((row) => {
            const state = translationState(row);
            const ref = row.refs[0];
            const link = ref ? buildPermalink(project, ref) : null;
            return (
              <li key={row.id} className="space-y-1 px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-mono min-w-0 break-all">{row.key}</span>
                  <StateBadge state={state} />
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto shrink-0 text-xs text-blue-600 underline"
                    >
                      {ref?.path.split("/").pop()}:{ref?.line}
                      {row.refs.length > 1 && ` +${row.refs.length - 1}`}
                    </a>
                  )}
                </div>
                <div className="text-sm">{row.sourceText}</div>
                {row.description && (
                  <div className="text-muted-foreground text-xs">{row.description}</div>
                )}
                <TranslationInput
                  keyId={row.id}
                  localeCode={active.code}
                  initialValue={row.value ?? ""}
                  disabled={row.orphaned}
                />
                {row.updatedBy && (
                  <div className="text-muted-foreground text-xs">— {row.updatedBy}</div>
                )}
              </li>
            );
          })}
        </ul>

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

function NsLink({
  href,
  active,
  label,
  total,
  pending,
}: {
  href: string;
  active: boolean;
  label: string;
  total: number;
  pending: number;
}) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-baseline gap-2 px-3 py-1.5 text-sm",
        // ⚠️ muted 표면 위에서는 hover:bg-accent가 무효다 (DESIGN.md §2.1).
        // 선택 상태는 muted 배경으로, hover는 글자색으로 낸다.
        active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("ml-auto shrink-0 text-xs", active ? "text-foreground/60" : "")}>
        {pending > 0 ? `${pending}/${total}` : total}
      </span>
    </a>
  );
}

/** DESIGN.md §6.2 — 배지 3종. 새 raw 색을 늘리지 않는다. */
function StateBadge({ state }: { state: ReturnType<typeof translationState> }) {
  if (state === "translated") return null;
  if (state === "orphaned") {
    return <span className="text-destructive shrink-0 text-xs">orphaned</span>;
  }
  if (state === "needsReview") {
    return (
      <span className="shrink-0 rounded bg-amber-100/80 px-1.5 py-0.5 text-xs text-amber-800">
        검토필요
      </span>
    );
  }
  return <span className="text-muted-foreground shrink-0 text-xs">미번역</span>;
}
