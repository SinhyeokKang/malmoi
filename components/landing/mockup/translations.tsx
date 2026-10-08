import { ArrowDownToLine, ArrowUp, ChevronDown, ChevronRight, FileJson2, Folder, Layers, Link2, Search, Send } from "lucide-react";
import type { ReactNode } from "react";

import { LocaleBadge } from "@/components/translations/locale-badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
import { fieldClass } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import { formatNumber } from "@/lib/number-format";
import { cn } from "@/lib/utils";

/**
 * 목업의 번역 화면 — 실제 `components/translations/workspace/`의 **정적 복제**다: 머리(제목 · Sync · Publish / 검색) ·
 * 본문 `p-4` 안의 카드 둘 — 왼쪽 **소스 트리 260 + 키 목록 392**(`TreePanel` · `KeyList`), 핸들 16, 오른쪽 로케일 상세(`LocalePanel`).
 * 1440 창의 폭 계약(`lib/translations/layout.ts` — 카드 영역 1142에서 트리가 접히지 않는다)이 그 배치를 정한다.
 *
 * `phase`가 씬 ①②③을 가른다: `missing`(fr 빈 칸) · `typing`(스테이지가 `[data-landing-typed]`에 접두를 쓴다) · `saving`(씬 ③ —
 * 프레임의 `data-badge`가 서는 순간 저장되고 Publish 배지가 는다) · `saved`(④의 배경) · `published`(⑤ 전달 완료).
 *
 * ⚠️ 버튼·입력 모양은 클래스를 `<span>`에 입힌다 — 목업은 조작 대상이 아니다(`repository-card.tsx` 선례).
 */
export type Phase = "missing" | "typing" | "saving" | "saved" | "published";

/** 보고 있는 소스 — 트리에서 펼쳐진 항목이고 키 목록의 수가 그 소스의 키 수다(`This source`). */
const currentSource = (fixture: Messages["landing"]["mockup"]) => fixture.sources.find(source => source.slug === fixture.source);

/** 씬 ③의 전·후 — 프레임의 `data-badge`가 1이 되는 순간 바뀐다(`group/frame`은 `components/landing/stage.tsx`). */
function Swap({ phase, before, after, display = "inline-flex" }: { phase: Phase; before: ReactNode; after: ReactNode; display?: "inline-flex" | "flex" }) {
  if (phase === "saved" || phase === "published") return <>{after}</>;
  if (phase !== "saving") return <>{before}</>;
  return (
    <>
      <span data-landing-badge="before" className={cn(display, "group-data-[badge=1]/frame:hidden")}>{before}</span>
      <span data-landing-badge="after" className={cn("hidden", display === "flex" ? "group-data-[badge=1]/frame:flex" : "group-data-[badge=1]/frame:inline-flex")}>{after}</span>
    </>
  );
}

/**
 * ⚠️ **상태·개수 표시는 실물 프리미티브를 그대로 쓴다** (ux-drift-unify 🔴 G · Q3 · Q13) — Unsent는 `StatusBadge unsent`, 개수는 `CountBadge`다.
 * 사본을 들면 실물이 바뀔 때 목업만 낡는다(옛 테두리 알약 `Pill` 사본이 그렇게 남았다). 둘 다 `<span>`이라 프레임 규칙(인터랙티브 태그 0)을 지킨다.
 */
const unsentBadge = () => <StatusBadge state="unsent" className="shrink-0" />;

/** Publish 버튼 안 개수 — 실물(`publish-button.tsx`)과 같은 어두운 면 덮개다. */
function PublishCount({ m, n }: { m: Messages; n: number }) {
  return <CountBadge count={n} label={m.translations.publish.unsentCount(n)} className="bg-background/20 text-current" />;
}

/**
 * `filter-menu.tsx`의 꺼진 트리거 — 실물 `FieldTrigger size="sm" active={false}`(28)의 정적 형이다. 카드 머리 둘(키 목록 Status · 로케일 상세 언어)이 쓴다.
 * 상호작용 상태(hover·disabled·focus·open)와 자식 선택자는 정적 사본에 없다 — `landing-mockup.test.tsx`가 나머지 토큰을 실물과 견준다.
 */
function FilterTrigger({ label }: { label: string }) {
  return (
    <span className={cn(fieldClass, "group inline-flex cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap", "h-7 px-2 text-xs", "border-border text-muted-foreground shrink-0")}>
      {label}
      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
    </span>
  );
}

export function TranslationsView({ m, phase, uiLocale }: { m: Messages; phase: Phase; uiLocale: UiLocale }) {
  const fixture = m.landing.mockup;
  const w = m.translations.workspace;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="text-lg font-medium">{m.common.nav.translations}</span>
            <CountBadge count={fixture.keyCount} label={m.translations.keys(fixture.keyCount)} />
          </span>
          <span className="ml-auto flex items-center gap-2">
            {/* OWNER의 Sync 버튼(`components/home/sync-button.tsx`) — 글리프 14다(16은 EDITOR 갈래). */}
            <span className={buttonClass({ variant: "default" })}>
              <ArrowDownToLine className="size-3.5 text-gray-strong" aria-hidden />
              {m.repositorySync.action}
            </span>
            {/* `publish-button.tsx`와 같은 묶음 — `flex gap-2` 안에 사유 `title`을 드는 감싼 칸 + 버튼, 결과가 있으면 `View result`. */}
            <span data-landing-publish-group="" className="flex items-center gap-2">
              <span>
                <Swap phase={phase === "published" ? "missing" : phase}
                  before={<span data-landing-publish="" aria-disabled className={cn(buttonClass({ variant: "primary" }), "bg-muted text-muted-foreground")}><Send aria-hidden />{m.translations.publish.button}</span>}
                  after={<span data-landing-publish="" className={buttonClass({ variant: "primary" })}><Send aria-hidden />{m.translations.publish.button}<PublishCount m={m} n={fixture.unsentAfter} /></span>}
                />
              </span>
              {phase === "published" && <span className={buttonClass({ variant: "default" })}>{m.translations.publish.viewResult}</span>}
            </span>
          </span>
        </div>
        <div data-landing-toolbar-row="" className="flex flex-wrap items-center gap-2">
          {/*
            툴바는 검색 하나뿐이고 왼쪽에 선다 — Status는 키 목록 머리가 든다(2026-10-02). `SearchInput width={320}` → `Input icon`의 형:
            글리프 칸은 세로 가운데 `left-2.5`, 필드는 `pl-8`. 값이 없어 자리표시 글자가 보이고 그 색은 preflight의 `currentcolor 50%`다.
          */}
          <span data-landing-search="" className="relative block w-fit min-w-0">
            <span aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
              <Search className="size-4" />
            </span>
            <span className={cn(fieldClass, "h-9 w-80 pl-8", "text-foreground/50 flex items-center")}>{w.filters.searchPlaceholder}</span>
          </span>
        </div>
        {phase !== "published" && (
          <Swap phase={phase} display="flex" before={null} after={
            <div data-landing-hold="" className="w-full space-y-3">
              <Alert variant="neutral" actions={<span className={buttonClass({ variant: "default" })}>{m.translations.banner.sendWithPublish}<ArrowUp className="size-3.5" aria-hidden /></span>}>
                {m.translations.banner.paused(fixture.unsentAfter)}
              </Alert>
            </div>
          } />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="flex h-full min-h-0">
          <div className="border-border bg-background relative flex min-h-0 w-[652px] shrink-0 overflow-hidden rounded-lg border">
            <SourceTree m={m} uiLocale={uiLocale} />
            <KeyList m={m} phase={phase} />
          </div>
          {/* 두 카드 사이 16px이 리사이즈 손잡이다 — 선을 그리지 않는다. */}
          <div className="w-4 shrink-0" />
          <div className="border-border bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border">
            <LocaleDetail m={m} phase={phase} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `tree-panel.tsx` — 소스 → 네임스페이스. 보고 있는 소스만 펼쳐지고(`All namespaces`가 선택), 나머지는 접힌다.
 * 네임스페이스가 13 미만이라 필터 입력이 없다(`FILTER_AT`).
 */
function SourceTree({ m, uiLocale }: { m: Messages; uiLocale: UiLocale }) {
  const fixture = m.landing.mockup;
  const current = currentSource(fixture);
  const t = m.translations.workspace.tree;
  return (
    <div data-landing-tree="" className="border-border flex min-h-0 w-[260px] shrink-0 flex-col border-r">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <span className="text-base font-medium">{t.title}</span>
        <CountBadge count={fixture.sources.length} label={m.sources.count(fixture.sources.length)} />
      </div>
      <div className="border-divider flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden border-t p-2">
        {fixture.sources.map((source) => {
          const open = source.slug === current?.slug;
          return (
            <div key={source.slug} data-landing-source={source.slug} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 rounded-sm px-2 py-[7px] text-sm">
                <span className="flex text-gray-strong">{open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}</span>
                <span className="flex text-gray-strong"><FileJson2 className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 truncate font-medium">{source.slug}</span>
                <span className="text-muted-foreground text-xs">{formatNumber(source.keyCount, uiLocale)}</span>
              </span>
              {open && (
                <>
                  <TreeItem icon={<Layers className="size-3.5" aria-hidden />} label={t.allNamespaces} n={source.keyCount} uiLocale={uiLocale} selected />
                  {source.namespaces.map((namespace) => (
                    <TreeItem key={namespace.name} icon={<Folder className="size-3.5" aria-hidden />} label={namespace.name} n={namespace.keyCount} uiLocale={uiLocale} selected={false} />
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 선택 면은 `ListRow selected`의 `bg-foreground/[0.07]`이다(DESIGN §5 — 키 목록 행과 같다, 5-Y7). `landing-mockup.test.tsx`가 실물을 렌더해 견준다. */
const SELECTED = "bg-foreground/[0.07]";

function TreeItem({ icon, label, n, selected, uiLocale }: { icon: ReactNode; label: string; n: number; selected: boolean; uiLocale: UiLocale }) {
  return (
    <span className={cn("flex items-center gap-2 rounded-sm py-1.5 pr-2 pl-[30px] text-sm", selected && SELECTED)}>
      <span className="flex text-gray-dim">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs">{formatNumber(n, uiLocale)}</span>
    </span>
  );
}

function KeyList({ m, phase }: { m: Messages; phase: Phase }) {
  const fixture = m.landing.mockup;
  const w = m.translations.workspace;
  const current = currentSource(fixture);
  const list = w.list;
  const unsent = new Set<string>(fixture.diff.filter((row) => row.key !== fixture.selected.key).map((row) => row.key));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div data-landing-list-head="" className="flex h-12 shrink-0 items-center gap-2 px-4">
        <span className="text-base font-medium">{list.keys}</span>
        <CountBadge count={current?.keyCount ?? 0} label={m.translations.keys(current?.keyCount ?? 0)} />
        {/* 실물 `key-list.tsx`처럼 `+n saved` 칸이 비어도 남아 필터를 오른쪽 끝으로 민다(번역값 패널의 언어 메뉴와 같은 자리). 정렬 문구는 없다(2026-10-02). */}
        <span data-landing-saved-extra="" className="text-muted-foreground ml-auto shrink-0 text-xs" />
        <FilterTrigger label={w.filters.state.any} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {fixture.rows.map((row, index) => {
          const isSelected = row.key === fixture.selected.key;
          // 미번역은 이상이 아니라 할 일이라 회색이다(실물 `key-list.tsx` — 1-Y10).
          const missing = <span className="text-muted-foreground shrink-0 text-xs">{list.missing(row.missing)}</span>;
          const complete = <span className="text-muted-foreground shrink-0 text-xs">{list.complete}</span>;
          return (
            <div key={row.key} data-landing-row={row.key} className={cn("flex shrink-0 items-start gap-3 border-t px-4 py-3", index === 0 ? "border-divider" : "border-border", isSelected && SELECTED)}>
              <span className="flex min-w-0 flex-1 flex-col gap-copy-gap">
                <span className="text-sm leading-[1.45]">{row.text}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs wrap-anywhere">{row.key}</span>
                  {phase !== "published" && unsent.has(row.key) && unsentBadge()}
                  {isSelected && phase !== "published" && phase !== "missing" && phase !== "typing" && <Swap phase={phase} before={null} after={unsentBadge()} />}
                </span>
              </span>
              {isSelected ? <Swap phase={phase} before={missing} after={complete} /> : row.missing > 0 ? missing : complete}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** `locale-panel.tsx` — 경로 머리 · 고정 블록(키 · N of M · 복사 · 설명) · 로케일 행 · 저장 푸터. */
function LocaleDetail({ m, phase }: { m: Messages; phase: Phase }) {
  const fixture = m.landing.mockup;
  const d = m.translations.workspace.detail;
  const selected = fixture.selected;
  const filled = selected.values.length;
  const total = filled + 1;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <FileJson2 className="size-4 shrink-0" aria-hidden />
          {fixture.source}
          <ChevronRight className="size-3.5 shrink-0 text-gray-dim" aria-hidden />
          <span className="text-foreground min-w-0 truncate font-medium">{fixture.namespace}</span>
        </span>
        <span className="ml-auto">
          <FilterTrigger label={d.allLanguages} />
        </span>
      </div>
      <div className="border-divider flex min-h-0 flex-1 flex-col overflow-hidden border-t">
        <div className="border-divider flex shrink-0 flex-col gap-1 border-b px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span data-landing-detail-key="" className="min-w-0 flex-1 text-base font-medium wrap-anywhere">{selected.key}</span>
            <Swap
              phase={phase}
              before={<span className="text-muted-foreground shrink-0 text-xs">{d.languages(filled, total)}</span>}
              after={<span className="text-muted-foreground shrink-0 text-xs">{d.languages(total, total)}</span>}
            />
            {/* 실물 `CopyButton variant="link"` — 실패 줄을 세울 칸(`flex shrink-0 items-center gap-1.5`) 안의 sm 버튼이다. */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span data-landing-copy="" className={cn(buttonClass({ variant: "default", size: "sm" }), "min-w-7 gap-1 px-1.5")}>
                <Link2 className="size-3.5 text-gray-strong" aria-hidden />
              </span>
            </span>
          </div>
          <span className="text-muted-foreground text-xs leading-normal">{selected.description}</span>
        </div>
        {/* ⚠️ 실제 앱은 이 목록이 스크롤한다 — 목업은 잘라서 푸터 위로 칠하지 않게 한다(#112). 행 예산은 셋이다. */}
        <div data-landing-locales="" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selected.values.map(({ code, value }, index) => (
            <LocaleRow key={code} m={m} code={code} first={index === 0} base={index === 0} status={null}>
              <span className="border-input bg-background min-h-[62px] rounded-md border px-2.5 py-2.5 text-sm leading-translation">{value}</span>
            </LocaleRow>
          ))}
          <TypedRow m={m} phase={phase} />
        </div>
        <Footer m={m} phase={phase} />
      </div>
    </div>
  );
}

function LocaleRow({ m, code, first, base = false, status, children }: { m: Messages; code: string; first: boolean; base?: boolean; status: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-2 px-4 py-3", !first && "border-border border-t")}>
      <div className="flex items-center gap-2">
        <LocaleBadge code={code} orphaned={false} />
        {base && <span className="text-muted-foreground text-xs">{m.translations.workspace.detail.source}</span>}
        <span className="ml-auto flex items-center gap-2">{status}</span>
      </div>
      {children}
    </div>
  );
}

/** `fr` 행 — ① 점선 안의 회색 원문 · ② 타이핑 · ③ 저장 전→후 · ④⑤ 저장됨(`Unsent` 배지). */
function TypedRow({ m, phase }: { m: Messages; phase: Phase }) {
  const selected = m.landing.mockup.selected;
  const d = m.translations.workspace.detail;
  const notSaved = <span className="text-warning-foreground text-xs">{d.notSaved}</span>;
  const notSent = unsentBadge();
  const status = phase === "published" ? null : phase === "missing" ? <span className="text-muted-foreground text-xs">{d.missing}</span> : phase === "typing" ? notSaved : <Swap phase={phase} before={notSaved} after={notSent} />;
  return (
    <LocaleRow m={m} code={selected.typedCode} first={false} status={status}>
      {phase === "missing" ? (
        // 실물 빈 입력은 64다 — 래퍼 바닥 62보다 점선 1·1 + `p-2.5` 10·10 + 빈 textarea `min-h-[42px]`가 크다(#189). textarea를 둘 수 없어 하한으로 든다.
        <span className="text-muted-foreground min-h-[64px] rounded-md border border-dashed border-gray-light p-2.5 text-sm leading-translation">{selected.text}</span>
      ) : (
        /*
          ② 실물 `Textarea`의 포커스 형(링 색 테두리 + ring-1). ⚠️ 접두가 아직 비면(스크럽 맨 앞) 실물은 빈 입력의 형이다 — 점선 `gray-light` 래퍼 ·
          바탕 없음 · 래퍼 ring-2 · 원문이 첫 줄 자리에 겹친다(`locale-panel.tsx`). 스테이지가 `[data-landing-typed]`에 글자를 쓰므로 `:empty`로 가른다.
        */
        <span className={cn("border-input bg-background relative min-h-[62px] rounded-md border px-2.5 py-2.5 text-sm leading-translation",
          phase === "typing" && "border-ring ring-ring ring-1 has-[[data-landing-typed]:empty]:min-h-[64px] has-[[data-landing-typed]:empty]:border-dashed has-[[data-landing-typed]:empty]:border-gray-light has-[[data-landing-typed]:empty]:bg-transparent has-[[data-landing-typed]:empty]:ring-2")}>
          {phase === "typing" ? <span data-landing-typed="" className="peer" /> : selected.typed}
          {phase === "typing" && <span data-landing-typed-source="" className="text-muted-foreground pointer-events-none absolute inset-0 hidden p-2.5 peer-empty:block">{selected.text}</span>}
          {phase === "typing" && <span className="bg-foreground ml-px inline-block h-4 w-px translate-y-[3px]" />}
        </span>
      )}
    </LocaleRow>
  );
}

/**
 * 저장 푸터 — 결과 줄 · (보낼 것이 있으면) `Revert to last sent` · Save. ⚠️ **Revert는 저장 뒤에 선다** — 실제 푸터가 이 키에 미전달
 * 편집이 있을 때만 그리고(`hasPending`), 보는 사람이 OWNER라 켜져 있다. 저장 전엔 이 키에 미전달이 없다.
 */
function Footer({ m, phase }: { m: Messages; phase: Phase }) {
  const w = m.translations.workspace;
  const f = w.footer;
  const unsaved = <span className="text-warning-foreground text-xs">{f.unsaved(1)}</span>;
  const saved = <span className="text-muted-foreground text-xs">{phase === "published" ? f.saved : f.savedNotSent}</span>;
  const text = phase === "missing" ? null : phase === "typing" ? unsaved : <Swap phase={phase} before={unsaved} after={saved} />;
  // 실물과 같은 `danger`다 — 편집을 버리는 동작이다(DESIGN §2.4 동작 규칙).
  const revert = <span className={buttonClass({ variant: "danger" })}>{w.revert.button}</span>;
  // 저장할 것이 없으면 Save가 꺼진다(`saveDisabled = dirty === 0`) — 씬 ③에서 저장되는 순간 함께 꺼진다.
  const saveOn = <span className={buttonClass({ variant: "primary" })}>{f.save}</span>;
  const saveOff = <span className={cn(buttonClass({ variant: "primary" }), "bg-muted text-muted-foreground")}>{f.save}</span>;
  return (
    <div className="border-border shrink-0 border-t">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 실물처럼 결과 줄은 늘 선다 — ①에선 빈 채다(`workspace.tsx`의 `data-footer-result`). */}
        <span className="flex min-w-0 flex-col">
          <span data-landing-footer-result="" className="min-w-0 text-xs">{text}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {phase === "saved" ? revert : phase === "saving" ? <Swap phase={phase} before={null} after={revert} /> : null}
          {phase === "typing" ? saveOn : phase === "saving" ? <Swap phase={phase} before={saveOn} after={saveOff} /> : saveOff}
        </span>
      </div>
    </div>
  );
}
