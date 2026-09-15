import { Archive, ChevronDown, CircleCheck } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { AttentionItem, AttentionList } from "@/lib/home/attention";
import type { HomeState } from "@/lib/home/state";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * `Needs your attention` (캔버스 `2a` 왼쪽 아래).
 *
 * ⚠️ **`+2 more`가 `<details>`다** (spec §9.9) — 클라이언트 상태가 0이라 Home 전체가 순수 서버
 * 컴포넌트로 남는다. `client-graph.test.ts`가 보는 그래프가 안 늘고 번들도 안 는다.
 */
export function AttentionCard({ items, slug, state }: { items: AttentionList; slug: string; state: HomeState }) {
  return (
    <section className="border-border rounded-xl border">
      <h2 className="border-border flex items-center gap-2 border-b p-3.5 text-sm font-medium">
        {m.home.attention.title}
        {/* ⚠️ **빈 상태에는 pill이 없다** (spec §8) — `0`을 배지로 세우면 그것이 하나의 항목처럼 읽힌다. */}
        {items.count > 0 && <Badge>{items.count}</Badge>}
      </h2>

      {items.count === 0 ? (
        <EmptyState
          className="py-8"
          icon={state === "archived" ? Archive : CircleCheck}
          title={state === "archived" ? m.home.attention.archived.title : m.home.attention.empty.title}
          description={state === "archived" ? m.home.attention.archived.description : m.home.attention.empty.description}
        />
      ) : (
        <>
          <ul className="divide-border divide-y">
            {items.shown.map((item) => (
              <li key={itemKey(item)}>
                <AttentionRow item={item} slug={slug} />
              </li>
            ))}
          </ul>
          {items.more.length > 0 && (
            /*
              ⚠️ **브라우저 기본 marker를 지운다** — 두 엔진이 서로 다른 삼각형을 그리고, 그 위에
              chevron을 얹으면 표식이 둘이 된다 (`[&::-webkit-details-marker]`는 Safari·Chrome,
              `list-none`이 Firefox를 덮는다). 회전도 CSS다: JS를 쓰면 이 카드가 클라이언트가 된다.
            */
            <details className="group border-border border-t">
              <summary className="focus-visible:ring-ring hover:bg-foreground/[0.02] flex cursor-pointer list-none items-center gap-1 p-3.5 text-xs focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                {m.home.attention.more(items.more.length)}
              </summary>
              <ul className="divide-border border-border divide-y border-t">
                {items.more.map((item) => (
                  <li key={itemKey(item)}>
                    <AttentionRow item={item} slug={slug} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/**
 * 항목 하나. **행 전체가 링크다** — 파서 실패는 설정 화면(사유와 복구 안내가 사는 자리), 나머지
 * 둘은 그 로케일만 보이는 번역 화면이다.
 */
function AttentionRow({ item, slug }: { item: AttentionItem; slug: string }) {
  const href =
    item.kind === "import_failed"
      ? routes.settings(slug)
      : routes.surfaceTranslations(slug, item.surfaceSlug, {
          locales: item.code,
          state: item.kind === "review" ? "review" : "untranslated",
        });

  return (
    <Link
      href={href}
      className="focus-visible:ring-ring hover:bg-foreground/[0.02] flex flex-col gap-0.5 p-3.5 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-xs font-medium">{title(item)}</span>
      <span className="text-muted-foreground text-xs">{body(item)}</span>
    </Link>
  );
}

function title(item: AttentionItem): string {
  if (item.kind === "import_failed") return m.home.attention.importFailed.title(item.surfaceSlug);
  const label = item.kind === "review" ? m.home.attention.review : m.home.attention.neverFilled;
  return label.title(item.surfaceSlug, item.name);
}

/**
 * ⚠️ **꼬리 절이 통째로 빠지는 갈래가 있다** (spec §9.11) — 이름을 못 찾으면
 * `8 cells are waiting for review.`로 끝난다. `who`가 `null`인지가 그 판정이고, 그 `null`은
 * `actorLabel`이 아니라 **`actors` 맵의 키 존재**에서 왔다.
 */
function body(item: AttentionItem): string {
  if (item.kind === "import_failed") return m.home.attention.importFailed.body + m.home.attention.importFailed.tail;
  if (item.kind === "review") {
    const head = m.home.attention.review.body(item.count);
    return item.who === null ? `${head}.` : head + m.home.attention.review.tail(item.who);
  }
  return m.home.attention.neverFilled.body(item.name) + m.home.attention.neverFilled.tail(item.keys);
}

/** 표면·로케일이 키다 — 같은 표면에 같은 코드가 둘일 수 없다(`@@id([projectId, surfaceId, code])`). */
function itemKey(item: AttentionItem): string {
  return item.kind === "import_failed" ? `failed:${item.surfaceSlug}` : `${item.kind}:${item.surfaceSlug}:${item.code}`;
}
