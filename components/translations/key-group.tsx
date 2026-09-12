import type { ReactNode } from "react";
import { TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
 * 키별 tbody와 rowSpan으로 로케일 행을 묶는다. 여러 줄 값은 브라우저의 행 높이 계산에 맡긴다.
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
  const keyCell = (
    <TableHead scope="rowgroup" rowSpan={locales.length} className="border-border h-auto border-r px-2 py-3 align-top font-normal whitespace-normal">
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
    </TableHead>
  );
  return (
    <TableBody className="border-border border-b">
      {locales.map((locale, index) => (
        <LocaleRow key={locale.code} slug={slug} row={row} locale={locale} actors={actors}
          lastPulledAt={lastPulledAt} keyCell={index === 0 ? keyCell : null} />
      ))}
    </TableBody>
  );
}

/** Metadata expands only for the active cell so completed rows retain the design's density. */
function LocaleRow({
  keyCell,
  slug,
  row,
  locale,
  actors,
  lastPulledAt,
}: {
  keyCell: ReactNode;
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
    <TableRow className="border-border hover:bg-transparent">
      {keyCell}
      <TableCell className="p-0 align-top">
        <div className="flex h-[46px] w-17 shrink-0 items-center justify-center">
          <LocaleBadge code={locale.code} orphaned={locale.orphaned} />
        </div>
      </TableCell>

      <TableCell className="border-border border-l p-0 align-top whitespace-normal">
        <div className="group/cell relative min-w-0 has-[textarea:focus-visible]:after:pointer-events-none has-[textarea:focus-visible]:after:absolute has-[textarea:focus-visible]:after:inset-px has-[textarea:focus-visible]:after:left-0 has-[textarea:focus-visible]:after:z-20 has-[textarea:focus-visible]:after:ring-ring has-[textarea:focus-visible]:after:ring-2">
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
      </TableCell>
    </TableRow>
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
