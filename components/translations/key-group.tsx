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

/**
 * 로케일 하나의 행 — 배지 + (입력 · 메타).
 *
 * ⚠️ **메타가 우측 고정 폭 슬롯이 아니라 입력 아래 줄이다** (malmoi#33, 2026-09-11 실측으로 뒤집혔다).
 * 초안은 배지 둘과 `Edited by`를 `w-40`(160) 우측 슬롯에 두고 *"렌더마다 변하지 않으므로 빈 상태에서도
 * 폭을 차지한다"*를 근거로 삼았는데, **1280px에서 그 예산이 안 남는다**: 값 열 366에서 로케일 칸 80 ·
 * 메타 160 · padding·gap 36을 빼면 입력이 **28px**이고 값이 한 글자씩 세로로 쌓였다(행 높이 210px).
 * 키 셀 320을 고정으로 두기로 한 이상(spec 「1280px」) 한 줄에 넷이 구조적으로 안 들어간다.
 *
 * ⚠️ **"입력 폭이 행마다 달라진다"는 걱정이 이 배치에서는 성립하지 않는다** — 메타가 아래 줄이면
 * 입력은 언제나 값 열 전체다. 그 걱정이 우측 슬롯 전제의 것이었다.
 *
 * ⚠️ **셀 저장 상태 4종은 여전히 `TranslationInput` 안이다.** `Not saved yet — leave the cell to save`가
 * 약 230px이고 타이핑 중에 나타났다 사라지므로 **입력과 같은 줄에 두면** `field-sizing-content`
 * textarea의 폭이 그때마다 재계산돼 줄바꿈과 커서가 튄다 — 그것이 우측 슬롯을 피한 원래 이유이고
 * 여기서도 지켜진다(메타와 저장 상태는 둘 다 입력 **아래**다).
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

  // orphaned 축은 키 셀·로케일 배지가 이미 말했다 — 여기서 또 말하지 않는다.
  const meta = state === "needsReview" || unsent || actor !== null;

  return (
    /*
      ⚠️ **행에 padding이 없다** (2026-09-11 — 시안 `212:5418`). 여백은 로케일 칸(68 고정)과 값 칸
      (`p-3`)이 각자 든다: 행이 자기 padding을 들면 hover·포커스 표면이 셀 폭 전체를 못 덮고
      값 텍스트의 좌측이 시안의 12에서 밀린다.
    */
    <div className="flex items-start">
      {/*
        ⚠️ **68이고 80이 아니다** — 시안 `212:5076`의 로케일 칸 폭이다. 값 열의 예산을 12px 돌려준다
        (`translations-screen.test.ts`가 그 합을 상시로 센다).

        ⚠️ **세로 중앙이 아니라 첫 줄에 맞춘다** (2026-09-11 실물에서 시안을 벗어났다). 시안의 로케일
        칸은 `items-center`인데 **그 시안에는 메타 줄이 없다** — 우리 행은 `Needs review`·`Edited by`가
        입력 **아래**에 붙어(malmoi#33) 블록 높이가 행마다 다르고, 중앙 정렬이면 메타가 있는 행에서만
        배지가 아래로 내려앉아 **같은 표에서 배지 높이가 들쭉날쭉해진다.** `pt-2.5`가 입력 첫 줄의
        중심(값 칸 `py-1.5` + 입력 `py-1` + 첫 줄 절반)과 배지 중심을 맞춘 값이다.
      */}
      <div className="flex w-17 shrink-0 justify-center pt-2.5">
        <LocaleBadge code={locale.code} isBase={locale.isBase} orphaned={locale.orphaned} />
      </div>

      {/* ⚠️ 이 열이 값 열 전체를 쓴다 — 우측에 고정 폭을 얹으면 1280에서 입력이 28px가 된다 (malmoi#33). */}
      <div className="min-w-0 flex-1 py-1.5 pr-3">
        <TranslationInput
          slug={slug}
          keyId={row.id}
          keyName={row.key}
          localeCode={locale.code}
          initialValue={cell?.value ?? ""}
          disabled={row.orphaned || locale.orphaned}
        />
        {meta && (
          // ⚠️ `px-3`이 입력의 좌측 padding과 같은 값이다 — 다르면 메타가 값보다 어긋난다.
          <div className="mt-1 flex flex-wrap items-baseline gap-1.5 px-3 text-xs">
            {state === "needsReview" && <Badge variant="warning">{m.translations.needsReview}</Badge>}
            {unsent && <Badge>{m.translations.notSent}</Badge>}
            {actor !== null && (
              <span className="text-muted-foreground min-w-0 truncate">
                {m.translations.editedBy(actor)}
              </span>
            )}
          </div>
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
