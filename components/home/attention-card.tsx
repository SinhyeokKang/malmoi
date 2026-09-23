import { Archive, ChevronRight, CircleCheck, CircleDot, Languages, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { AttentionItem, AttentionList } from "@/lib/home/attention";
import type { HomeState } from "@/lib/home/state";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { ALL_NAMESPACES, routes } from "@/lib/routes";

/**
 * `Needs your attention` (캔버스 `2a` 왼쪽 가운데).
 *
 * ⚠️ **`+2 more`가 `<details>`다** (DESIGN §6.64) — 클라이언트 상태가 0이라 Home 전체가 순수 서버
 * 컴포넌트로 남는다. `client-graph.test.ts`가 보는 그래프가 안 늘고 번들도 안 는다.
 *
 * ⚠️ **행에 버튼도 바닥 링크도 없다** — 이 항목은 DB 상태에서 파생된 **사실**이라 지워도 원인이
 * 남고, 전체 목록 화면을 만들면 Home과 같은 것이 둘이 된다 (캔버스 근거 열).
 */

/**
 * 항목 종류별 타일 — **28 · radius 4 · 글리프 16** (캔버스).
 *
 * ⚠️ **미채움 타일이 캔버스와 다르다.** 캔버스는 `#0891b2` 면에 `mail` 글리프인데 그것은 **그
 * 표면(emails)의 아이콘**이지 항목 종류의 색이 아니다 — 표면별 아이콘·색을 정하는 데이터가 없고
 * (`TranslationSurface`에 그런 컬럼이 없다) `#0891b2`는 §6.2 미등재 raw 색이다. 검토와 같은 무채색
 * 타일에 `languages`를 놓는다. **의도된 이탈이고 `docs/DESIGN.md`에 있다.**
 */
const TILE: Record<AttentionItem["kind"], { icon: ComponentType<{ className?: string }>; className: string }> = {
  import_failed: { icon: TriangleAlert, className: "bg-amber-100/80 text-amber-800" },
  review: { icon: CircleDot, className: "bg-foreground/5 text-muted-foreground" },
  never_filled: { icon: Languages, className: "bg-foreground/5 text-muted-foreground" },
};

export function AttentionCard({ items, slug, role, state, now }: {
  items: AttentionList;
  slug: string;
  /** 가져오기 실패의 목적지(Sources의 재시도)가 OWNER 전용이라 역할이 행의 형을 가른다. */
  role: Role;
  state: HomeState;
  now: Date;
}) {
  return (
    /*
      ⚠️ **`<section>`은 접근 이름이 있을 때만 `region` 랜드마크다** — 없으면 Chrome이 `generic`으로
      접어 이 블록이 접근성 트리에서 통째로 사라진다 (2026-09-15 CDP 실측). 시각적으로는 같아서
      화면에도 jsdom 테스트에도 안 나타나는 부류다 (2026-09-13의 `combobox` 빈 이름과 같은 축).
    */
    <section className="border-border overflow-hidden rounded-lg border" aria-labelledby="home-attention-title">
      <h2 id="home-attention-title" className="flex items-center gap-2 p-4 text-base font-medium">
        {m.home.attention.title}
        {/* ⚠️ **빈 상태에는 pill이 없다** (캔버스 `2a-empty`) — `0`을 배지로 세우면 하나의 항목처럼 읽힌다. */}
        {items.count > 0 && (
          <span className="bg-foreground/5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium">
            {items.count}
          </span>
        )}
      </h2>

      {items.count === 0 ? (
        <EmptyState
          className="border-divider border-t px-4 py-8"
          icon={state === "archived" ? Archive : CircleCheck}
          title={state === "archived" ? m.home.attention.archived.title : m.home.attention.empty.title}
          description={state === "archived" ? m.home.attention.archived.description : m.home.attention.empty.description}
        />
      ) : (
        <>
          <ul>
            {items.shown.map((item) => (
              <li key={itemKey(item)}>
                <AttentionRow item={item} slug={slug} role={role} now={now} />
              </li>
            ))}
          </ul>
          {items.more.length > 0 && (
            /*
              ⚠️ **브라우저 기본 marker를 지운다** — 두 엔진이 서로 다른 삼각형을 그리고, 그 위에
              chevron을 얹으면 표식이 둘이 된다 (`[&::-webkit-details-marker]`는 Safari·Chrome,
              `list-none`이 Firefox를 덮는다). 회전도 CSS다: JS를 쓰면 이 카드가 클라이언트가 된다.
            */
            <details className="group">
              <summary className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-divider flex cursor-pointer list-none items-center gap-1 border-t px-4 py-3.5 text-xs focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
                {m.home.attention.more(items.more.length)}
              </summary>
              <ul>
                {items.more.map((item) => (
                  <li key={itemKey(item)}>
                    <AttentionRow item={item} slug={slug} role={role} now={now} />
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
 * 항목 하나. **행 전체가 링크이고 chevron은 표시일 뿐이다** — 가져오기 실패는 Sources(표면별 사유와
 * 재시도가 사는 자리 — audit #6: 전엔 설정 화면이었고 거기엔 그 정보가 0이었다), 나머지 둘은 그 로케일만
 * 보이는 번역 화면이다.
 *
 * ⚠️ **EDITOR의 가져오기 실패는 링크가 아니다** — 재시도가 `project:settings` 뒤라 누를 곳이 없다. 사실(어느
 * 표면이 실패했나)은 그대로 읽히고 담당자 안내 한 줄이 붙는다 (`/projects` 목록 띠와 같은 규칙).
 *
 * ⚠️ **구분선이 `--divider`(#f0f0f0)이고 `--border`(#e5e5e5)가 아니다** — 카드 **안**의 선은 카드
 * 테두리보다 연해야 행 셋이 한 덩어리로 읽힌다 (DESIGN §6.2에 등재된 토큰).
 */
function AttentionRow({ item, slug, role, now }: { item: AttentionItem; slug: string; role: Role; now: Date }) {
  const settled = item.kind !== "import_failed" || canPerform(role, "project:settings");
  const href =
    item.kind === "import_failed"
      ? routes.sources(slug)
      : routes.surfaceTranslations(slug, item.surfaceSlug, item.kind === "review"
          // 그 로케일의 검토 대기 — 상세 언어를 그 로케일로 좁힌다(translation-rework T12).
          ? { ns: ALL_NAMESPACES, state: "review", language: item.code }
          // 그 로케일이 비어 있는 키 — `Missing in {locale}`이 정확히 그 뜻이다.
          : { ns: ALL_NAMESPACES, completion: "missing", missingLocale: item.code });
  const tile = TILE[item.kind];
  const Tile = tile.icon;

  const row = (children: ReactNode) => settled
    ? <Link href={href} className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-divider flex items-center gap-3 border-t px-4 py-3.5 focus-visible:ring-2 focus-visible:outline-none">{children}</Link>
    : <div className="border-divider flex items-center gap-3 border-t px-4 py-3.5">{children}</div>;

  return row(
    <>
      <span className={`flex size-7 shrink-0 items-center justify-center rounded ${tile.className}`}>
        <Tile className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* ⚠️ **한 줄로 자른다** — 표면·로케일 이름이 길어지면 둘째 줄이 밀려 행 높이가 흔들린다. */}
        <span className="text-muted-foreground truncate text-xs">{title(item)}</span>
        <span className="text-base">
          {/* 굵은 조각이 **사실**이고 나머지가 그 근거다 — 색이 아니라 무게로 가른다 (캔버스). */}
          <span className="font-medium">{body(item)}</span>
          {tail(item)}
        </span>
        {!settled && <span className="text-muted-foreground text-xs">{m.projects.importFailure.contactOwner}</span>}
      </span>
      {/* ⚠️ 시각은 `neutral-400`이다 — 보조 줄(`#737373`)보다 한 단계 더 물러난다. */}
      <span className="shrink-0 text-xs text-neutral-400">
        {item.at === null ? m.home.meta.never : relativeTime(item.at, now)}
      </span>
      {settled && <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />}
    </>,
  );
}

function title(item: AttentionItem): string {
  if (item.kind === "import_failed") return m.home.attention.importFailed.title(item.surfaceSlug);
  const label = item.kind === "review" ? m.home.attention.review : m.home.attention.neverFilled;
  return label.title(item.surfaceSlug, item.name);
}

function body(item: AttentionItem): string {
  if (item.kind === "import_failed") return m.home.attention.importFailed.body;
  if (item.kind === "review") return m.home.attention.review.body(item.count);
  return m.home.attention.neverFilled.body(item.name);
}

/**
 * ⚠️ **꼬리 절이 통째로 빠지는 갈래가 있다** (DESIGN §6.64) — 이름을 못 찾으면
 * `8 cells are waiting for review.`로 끝난다. `who`가 `null`인지가 그 판정이고, 그 `null`은
 * `actorLabel`이 아니라 **`actors` 맵의 키 존재**에서 왔다.
 */
function tail(item: AttentionItem): string {
  if (item.kind === "import_failed") return m.home.attention.importFailed.tail;
  if (item.kind === "review") return item.who === null ? "." : m.home.attention.review.tail(item.who);
  return m.home.attention.neverFilled.tail(item.keys);
}

/** 표면·로케일이 키다 — 같은 표면에 같은 코드가 둘일 수 없다(`@@id([projectId, surfaceId, code])`). */
function itemKey(item: AttentionItem): string {
  return item.kind === "import_failed" ? `failed:${item.surfaceSlug}` : `${item.kind}:${item.surfaceSlug}:${item.code}`;
}
