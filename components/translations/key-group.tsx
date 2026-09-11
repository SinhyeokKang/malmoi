import { ExternalLink } from "lucide-react";

import { TranslationInput } from "@/components/translation-input";
import { LocaleBadge } from "@/components/translations/locale-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import type { ProjectContext } from "@/lib/keys/query";
import {
  actorLabel, buildPermalink, cellState, isUnpublished,
  type Actor, type KeyRow,
} from "@/lib/keys/view";

/**
 * 키 하나 + 그 아래 로케일 행들 (8-4 design §1 — 시안 `212:937`).
 *
 * ⚠️ **`<table>`이 아니라 `div` + `grid`다.** 시안은 키 셀이 로케일 행들을 세로로 걸치는 구조라
 * `rowSpan`이 자연스러워 보이지만, 값이 여러 줄이면 행 높이가 로케일마다 달라 `rowSpan`이 정렬을
 * 어긋나게 한다 — 이 화면의 값은 여러 줄일 수 있다(`Textarea` + `field-sizing-content`).
 * 잃은 시맨틱을 대신하는 것: 열 헤더의 이름 → 각 입력의 `aria-label`(`{키} · {로케일}`),
 * 섹션 구분 → 실제 `<h2>`(페이지가 든다), 본문 랜드마크 → `ContentPanel`의 `<main>`.
 *
 * ⚠️ **서버 컴포넌트다.** 클라이언트는 `TranslationInput`뿐이고, 그래서 `lib/keys/view.ts`를
 * 값으로 읽어도 그 그래프가 번들에 안 간다 (`client-graph.test.ts`가 상시로 센다).
 */
export function KeyGroup({
  slug,
  row,
  locales,
  project,
  actors,
  lastPulledAt,
}: {
  slug: string;
  row: KeyRow;
  /**
   * 보이는 로케일 — base가 맨 앞이다. 원문이 위에 있어야 그 아래를 채운다 (MVP §3.2).
   *
   * ⚠️ **`isBase`를 받지 않는다** — 정렬은 호출부(`sortLocales`)가 이미 했고 배지는 그 라벨을 안 든다.
   * 여기서 다시 받으면 "쓰지 않는 필드"가 이 표의 계약처럼 읽힌다.
   */
  locales: readonly { code: string; orphaned: boolean }[];
  project: ProjectContext;
  actors: Map<string, Actor>;
  lastPulledAt: Date | null;
}) {
  return (
    <div className="border-border grid grid-cols-[320px_minmax(0,1fr)] border-b">
      {/*
        키 셀 — 이름 · orphaned · 설명 · 코드 참조. 시안의 320×123이 열려 있는 자리다 (design §4).

        ⚠️ **오른쪽 경계선을 이 셀이 든다** (2026-09-11 — 시안 `212:5079`의 `border-r`). 값 열의
        로케일 행 구분선은 그 선에서 시작하므로, 없으면 **키가 몇 줄을 걸치는지**가 표에서 사라진다.

        ⚠️ **좌우 padding이 8이다** — 시안의 키 셀 텍스트가 x=8이고, 네임스페이스 헤딩도 같은 선에
        선다. `px-4`면 그 둘이 6px 어긋난다.
      */}
      <div className="border-border min-w-0 border-r px-2 py-3">
        <div className="flex items-baseline gap-1.5">
          {/*
            ⚠️ **sans다 — `text-mono`가 아니다** (2026-09-11 사용자, 시안 `212:3814`가 14px regular).
            DESIGN §4.1의 mono 표면 목록에서 **번역 키만** 빠졌다: 이 화면은 표 전체가 키이고,
            2,709행에서 mono가 깔리면 자폭이 sans의 1.2배라 320 칸의 트렁케이션이 그만큼 늘어난다.
            나머지 식별자(slug·리포명·브랜치·로케일 코드)는 그대로 mono다 — 그쪽은 화면에 한둘이다.
          */}
          <span className="min-w-0 text-sm break-all">{row.key}</span>
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
      </div>

      {/* ⚠️ 구분선 색이 키 셀의 `border-r`과 **같아야** 한다 — `/60`이면 세로선만 진해 격자가 어긋나 보인다. */}
      <div className="divide-border min-w-0 divide-y">
        {locales.map((locale) => (
          <LocaleRow
            key={locale.code}
            slug={slug}
            row={row}
            locale={locale}
            actors={actors}
            lastPulledAt={lastPulledAt}
          />
        ))}
      </div>
    </div>
  );
}

/** Metadata expands only for the active cell so completed rows retain the design's density. */
function LocaleRow({
  slug,
  row,
  locale,
  actors,
  lastPulledAt,
}: {
  slug: string;
  row: KeyRow;
  /** ⚠️ `isBase`가 없다 — 배지가 그 라벨을 안 들고, 이 표에서 base는 **순서**가 말한다. */
  locale: { code: string; orphaned: boolean };
  actors: Map<string, Actor>;
  lastPulledAt: Date | null;
}) {
  const cell = row.cells[locale.code];
  const state = cellState(row, locale.code);
  const actor = actorLabel(cell?.updatedBy ?? null, actors);
  const unsent = cell !== undefined && isUnpublished(cell, lastPulledAt);

  const meta = state === "needsReview" || unsent || actor !== null;
  const metaLabel = [
    state === "needsReview" ? m.translations.needsReview : null,
    unsent ? m.translations.notSent : null,
    actor !== null ? m.translations.editedBy(actor) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex items-start">
      <div className="flex h-[46px] w-17 shrink-0 items-center justify-center">
        <LocaleBadge code={locale.code} orphaned={locale.orphaned} />
      </div>

      <div className="group/cell border-border relative min-w-0 flex-1 border-l has-[textarea:focus-visible]:after:pointer-events-none has-[textarea:focus-visible]:after:absolute has-[textarea:focus-visible]:after:inset-px has-[textarea:focus-visible]:after:left-0 has-[textarea:focus-visible]:after:z-20 has-[textarea:focus-visible]:after:ring-ring has-[textarea:focus-visible]:after:ring-2">
        <TranslationInput
          slug={slug}
          keyId={row.id}
          keyName={row.key}
          localeCode={locale.code}
          initialValue={cell?.value ?? ""}
          disabled={row.orphaned || locale.orphaned}
        />
        {meta && (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label={metaLabel}
              title={metaLabel}
              className="absolute top-[7px] right-1 h-8 w-6 px-0"
            >
              <span aria-hidden="true" className={state === "needsReview"
                ? "block size-2 rotate-45 bg-amber-500"
                : unsent ? "block size-2 rounded-full border border-current text-muted-foreground"
                  : "block size-2 rounded-full bg-muted-foreground/40"} />
            </Button>
            <div className="hidden flex-wrap items-baseline gap-1.5 px-3 pb-2 text-xs group-focus-within/cell:flex">
              {state === "needsReview" && <Badge variant="warning">{m.translations.needsReview}</Badge>}
              {unsent && <Badge>{m.translations.notSent}</Badge>}
              {actor !== null && (
                <span className="text-muted-foreground min-w-0 break-words">
                  {m.translations.editedBy(actor)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CodeRef({ row, project }: { row: KeyRow; project: ProjectContext }) {
  const ref = row.refs[0];
  if (!ref) return null;
  const link = buildPermalink(project, ref);
  if (!link) return null;
  return (
    // 리포 밖으로 나가는 링크는 색 + `ExternalLink` 12 (DESIGN §6.3)
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      className="mt-0.5 inline-flex items-baseline gap-1 text-xs text-blue-600"
    >
      {ref.path.split("/").pop()}:{ref.line}
      {row.refs.length > 1 && ` +${row.refs.length - 1}`}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
