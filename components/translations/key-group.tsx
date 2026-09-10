import { ExternalLink } from "lucide-react";

import { TranslationInput } from "@/components/translation-input";
import { LocaleBadge } from "@/components/translations/locale-badge";
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
  /** 보이는 로케일 — base가 맨 앞이다. 원문이 위에 있어야 그 아래를 채운다 (MVP §3.2). */
  locales: readonly { code: string; isBase: boolean; orphaned: boolean }[];
  project: ProjectContext;
  actors: Map<string, Actor>;
  lastPulledAt: Date | null;
}) {
  return (
    <div className="border-border grid grid-cols-[320px_minmax(0,1fr)] border-b last:border-b-0">
      {/* 키 셀 — 이름 · orphaned · 설명 · 코드 참조. 시안의 320×123이 열려 있는 자리다 (design §4). */}
      <div className="min-w-0 px-4 py-3">
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
      </div>

      <div className="divide-border/60 min-w-0 divide-y">
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

/**
 * 로케일 하나의 행 — 배지 · 입력 · **우측 고정 폭 메타 슬롯**.
 *
 * ⚠️ **셀 저장 상태 4종은 이 슬롯이 아니라 입력 아래 줄이다** (`TranslationInput` 안).
 * `Not saved yet — leave the cell to save`가 약 230px이고 타이핑 중에 나타났다 사라져서, 우측에
 * 두면 `field-sizing-content` textarea의 폭이 그때마다 재계산돼 줄바꿈과 커서가 튄다.
 * 배지 둘과 `Edited by`는 렌더마다 변하지 않으므로 여기 들어가고, **빈 상태에서도 폭을 차지한다**.
 */
function LocaleRow({
  slug,
  row,
  locale,
  actors,
  lastPulledAt,
}: {
  slug: string;
  row: KeyRow;
  locale: { code: string; isBase: boolean; orphaned: boolean };
  actors: Map<string, Actor>;
  lastPulledAt: Date | null;
}) {
  const cell = row.cells[locale.code];
  const state = cellState(row, locale.code);
  const actor = actorLabel(cell?.updatedBy ?? null, actors);
  const unsent = cell !== undefined && isUnpublished(cell, lastPulledAt);

  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <div className="flex w-20 shrink-0 justify-center pt-1.5">
        <LocaleBadge code={locale.code} isBase={locale.isBase} orphaned={locale.orphaned} />
      </div>

      <div className="min-w-0 flex-1">
        <TranslationInput
          slug={slug}
          keyId={row.id}
          keyName={row.key}
          localeCode={locale.code}
          initialValue={cell?.value ?? ""}
          disabled={row.orphaned || locale.orphaned}
        />
      </div>

      {/* ⚠️ `shrink-0` + 고정 폭 — 비어 있어도 자리를 지켜야 입력 폭이 행마다 달라지지 않는다. */}
      <div className="flex w-40 shrink-0 items-baseline justify-end gap-1.5 pt-1.5 text-xs">
        {/* orphaned 축은 키 셀·로케일 배지가 이미 말했다 — 여기서 또 말하지 않는다. */}
        {state === "needsReview" && <Badge variant="warning">{m.translations.needsReview}</Badge>}
        {unsent && <Badge>{m.translations.notSent}</Badge>}
        {actor !== null && (
          <span className="text-muted-foreground min-w-0 truncate">
            {m.translations.editedBy(actor)}
          </span>
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
