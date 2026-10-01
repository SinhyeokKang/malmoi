import { Archive, ChevronRight, CircleCheck, CircleX, Eye, Languages, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { PanelCard } from "@/components/ui/panel-card";
import { EmptyRowCard } from "@/components/ui/row-card";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { AttentionItem, AttentionList } from "@/lib/home/attention";
import type { HomeState } from "@/lib/home/state";
import { m } from "@/lib/i18n";
import { importFailureTone } from "@/lib/projects/import-failure";
import { relativeTime } from "@/lib/relative-time";
import { ALL_NAMESPACES, routes } from "@/lib/routes";
import type { StateTone } from "@/lib/status/canon";
import { IconTile } from "@/components/ui/icon-tile";

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
const TILE: Record<AttentionItem["kind"], { icon: ComponentType<{ className?: string }>; tone: StateTone }> = {
  // 실패는 어디서나 붉은 면 + `CircleX`다(DESIGN §2.4 글리프 열 — `TriangleAlert`는 danger 옆에 서지 않는다, 5-Y4).
  import_failed: { icon: CircleX, tone: "danger" },
  // 검토 대기는 호박 + `Eye`다 — 같은 Home의 카운트 카드·목록 띠와 같은 글리프(5-Y5).
  review: { icon: Eye, tone: "warning" },
  never_filled: { icon: Languages, tone: "muted" },
};

/** 일부 반영은 경고 칸 + `TriangleAlert`다 — 실패 원을 빌리지 않는다(🔴 A2 · §2.4 글리프 열). */
const PARTIAL_TILE = { icon: TriangleAlert, tone: "warning" } as const;

export function AttentionCard({ items, slug, role, state, now }: {
  items: AttentionList;
  slug: string;
  /** 가져오기 실패의 재시도가 OWNER 전용이라 EDITOR 행에만 그 사실 한 줄이 붙는다. */
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
    /*
      카드 머리는 `PanelCard`가 든다(5-Y12 — 손으로 복제한 머리가 셋이었다). 머리 아래 선도 머리가 긋고, 접근 이름(`region`)도 프리미티브가 건다.
      ⚠️ **빈 상태에는 pill이 없다** (캔버스 `2a-empty`) — `0`을 배지로 세우면 하나의 항목처럼 읽힌다. `CountBadge`가 든다.
    */
    <PanelCard title={m.home.attention.title} count={items.count} countLabel={m.home.attention.count(items.count)}>
      {items.count === 0 ? (
        /*
          카드 안 0건은 `EmptyRowCard inset` 하나다(4-Y14 — Sources·대기 초대와 같은 형). ⚠️ `-mt-px` — inset은 자기 위 선을 드는데
          `PanelCard`는 머리가 선을 긋는다. 같은 색 두 줄을 한 줄로 겹친다.
        */
        <div className="-mt-px">
          <EmptyRowCard
            inset
            icon={state === "archived" ? Archive : CircleCheck}
            title={state === "archived" ? m.home.attention.archived.title : m.home.attention.empty.title}
            description={state === "archived" ? m.home.attention.archived.description : m.home.attention.empty.description}
          />
        </div>
      ) : (
        <>
          <ul>
            {items.shown.map((item) => (
              // 첫 행은 머리 선 바로 아래라 자기 선을 내려놓는다.
              <li key={itemKey(item)} className="[&:first-child>a]:border-t-0">
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
              <summary className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-border flex cursor-pointer list-none items-center gap-1 border-t px-4 py-3.5 text-xs focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
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
    </PanelCard>
  );
}

/**
 * 항목 하나. **행 전체가 링크이고 chevron은 표시일 뿐이다** — 가져오기 실패는 Sources(표면별 사유와
 * 재시도가 사는 자리 — audit #6: 전엔 설정 화면이었고 거기엔 그 정보가 0이었다), 나머지 둘은 그 로케일만
 * 보이는 번역 화면이다.
 *
 * ⚠️ **EDITOR도 같은 링크다** (audit #6 r1 — 사용자 결정) — Sources는 `translation:write`라 EDITOR도 열어 사유를
 * 읽는다. 재시도만 `project:settings` 뒤라 그 사실 한 줄이 붙는다 (`/projects` 목록 띠와 같은 규칙).
 *
 * ⚠️ **선은 `RowCard` 규칙이다** (4-Y4 · DESIGN §6.64) — 머리↔첫 행은 머리의 `--divider`(#f0f0f0), 행↔행은 `--border`(#e5e5e5).
 * 옛 판은 행↔행도 `--divider`라 같은 `EventRow`가 Home과 Logs에서 반대 색이었다.
 */
function AttentionRow({ item, slug, role, now }: { item: AttentionItem; slug: string; role: Role; now: Date }) {
  const ownerRetries = item.kind === "import_failed" && !canPerform(role, "project:settings");
  const href =
    item.kind === "import_failed"
      ? routes.sources(slug)
      : routes.surfaceTranslations(slug, item.surfaceSlug, item.kind === "review"
          // 그 로케일의 검토 대기 — 상세 언어를 그 로케일로 좁힌다(translation-rework T12).
          ? { ns: ALL_NAMESPACES, state: "review", language: item.code }
          // 그 로케일이 비어 있는 키 — `Incomplete` + 상세 언어 그 로케일이다(translation-tree-range — `Untranslated in` 목록 필터가 사라졌다).
          // 다른 로케일만 빈 키가 섞이는 것은 사용자가 수용한 대가다(spec "잃는 것").
          : { ns: ALL_NAMESPACES, completion: "incomplete", language: item.code });
  // 실패 칩의 톤은 코드가 정한다 — 일부 반영은 호박(2026-09-30 상태 통일).
  const tile = item.kind === "import_failed" && importFailureTone(item.reason) === "warning" ? PARTIAL_TILE : TILE[item.kind];
  const Tile = tile.icon;

  return (
    <Link
      href={href}
      className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-border flex items-center gap-3 border-t px-4 py-[13px] focus-visible:ring-2 focus-visible:outline-none"
    >
      <IconTile tone={tile.tone}>
        <Tile aria-hidden />
      </IconTile>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base">
          {/* 굵은 조각이 **사실**이고 나머지가 그 근거다 — 색이 아니라 무게로 가른다 (캔버스). */}
          <span className="font-medium">{body(item)}</span>
          {tail(item)}
        </span>
        {/*
          보조줄(표면 · 로케일)은 본문 **아래**다(Q9 · 4-Y10 — 다른 모든 행과 같은 형, 옛 판은 이 행만 위였다).
          ⚠️ **한 줄로 자른다** — 표면·로케일 이름이 길어지면 줄이 밀려 행 높이가 흔들린다.
        */}
        <span className="text-muted-foreground truncate text-xs">{title(item)}</span>
        {ownerRetries && <span className="text-muted-foreground text-xs">{m.projects.importFailure.ownerRetries}</span>}
      </span>
      {/*
        시각은 `muted`다(2026-09-30 사용자 — 같은 Home의 Log 행 시각과 맞췄다. 옛 `neutral-400`은 2.5:1이라 읽기 어려웠다).
        ⚠️ **시각이 없으면 칸을 비운다** — 실패 시각이 기록되지 않은 실패 항목에 "Never"를 적으면 거짓이다(실패는 일어났다).
      */}
      {item.at !== null && <span className="text-muted-foreground shrink-0 text-xs">{relativeTime(item.at, now)}</span>}
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </Link>
  );
}

function title(item: AttentionItem): string {
  if (item.kind === "import_failed") return m.home.attention.importFailed.title(item.surfaceSlug);
  const label = item.kind === "review" ? m.home.attention.review : m.home.attention.neverFilled;
  return label.title(item.surfaceSlug, item.name);
}

function body(item: AttentionItem): string {
  // 일부만 반영된 표면은 실패 문장을 빌리지 않는다(DESIGN §2.4 — 데이터는 들어갔다).
  if (item.kind === "import_failed") return importFailureTone(item.reason) === "warning" ? m.home.attention.partial.body : m.home.attention.importFailed.body;
  if (item.kind === "review") return m.home.attention.review.body(item.count);
  return m.home.attention.neverFilled.body(item.name);
}

/**
 * ⚠️ **꼬리 절이 통째로 빠지는 갈래가 있다** (DESIGN §6.64) — 이름을 못 찾으면
 * `8 cells are waiting for review.`로 끝난다. `who`가 `null`인지가 그 판정이고, 그 `null`은
 * `actorLabel`이 아니라 **`actors` 맵의 키 존재**에서 왔다.
 */
function tail(item: AttentionItem): string {
  if (item.kind === "import_failed") return importFailureTone(item.reason) === "warning" ? m.home.attention.partial.tail : m.home.attention.importFailed.tail;
  if (item.kind === "review") return item.who === null ? "." : m.home.attention.review.tail(item.who);
  return m.home.attention.neverFilled.tail(item.keys);
}

/** 표면·로케일이 키다 — 같은 표면에 같은 코드가 둘일 수 없다(`@@id([projectId, surfaceId, code])`). */
function itemKey(item: AttentionItem): string {
  return item.kind === "import_failed" ? `failed:${item.surfaceSlug}` : `${item.kind}:${item.surfaceSlug}:${item.code}`;
}
