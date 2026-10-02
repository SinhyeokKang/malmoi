import { ArrowDownToLine, ArrowUp, ChevronDown, ChevronRight, FileJson2, Folder, Layers, Link2, Search, Send } from "lucide-react";
import type { ReactNode } from "react";

import { LocaleBadge } from "@/components/translations/locale-badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
import { fieldClass } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 목업의 번역 화면 — 실제 `components/translations/workspace/`의 **정적 복제**다: 머리(제목 · Sync · Publish / 필터 셋 · 검색) ·
 * 본문 `p-4` 안의 카드 둘 — 왼쪽 **소스 트리 260 + 키 목록 392**(`TreePanel` · `KeyList`), 핸들 16, 오른쪽 로케일 상세(`LocalePanel`).
 * 1440 창의 폭 계약(`lib/translations/layout.ts` — 카드 영역 1142에서 트리가 접히지 않는다)이 그 배치를 정한다.
 *
 * `phase`가 씬 ①②③을 가른다: `missing`(fr 빈 칸) · `typing`(스테이지가 `[data-landing-typed]`에 접두를 쓴다) · `saving`(씬 ③ —
 * 프레임의 `data-badge`가 서는 순간 저장되고 Publish 배지가 는다) · `saved`(④의 배경) · `published`(⑤ 전달 완료).
 *
 * ⚠️ 버튼·입력 모양은 클래스를 `<span>`에 입힌다 — 목업은 조작 대상이 아니다(`repository-card.tsx` 선례).
 */
export type Phase = "missing" | "typing" | "saving" | "saved" | "published";

const fixture = m.landing.mockup;
const w = m.translations.workspace;
const count = (n: number) => n.toLocaleString("en-US");
/** 보고 있는 소스 — 트리에서 펼쳐진 항목이고 키 목록의 수가 그 소스의 키 수다(`This source`). */
const current = fixture.sources.find(source => source.slug === fixture.source);

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
const unsentBadge = <StatusBadge state="unsent" />;

/** Publish 버튼 안 개수 — 실물(`publish-button.tsx`)과 같은 어두운 면 덮개다. */
function PublishCount({ n }: { n: number }) {
  return <CountBadge count={n} label={m.translations.publish.unsentCount(n)} className="bg-background/20 text-current" />;
}

/** `filter-menu.tsx`의 꺼진 트리거 — md 36(머리) · sm 28(카드 머리). */
function FilterTrigger({ label, size }: { label: string; size: "md" | "sm" }) {
  return (
    <span className={cn("bg-background border-border text-muted-foreground inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border", size === "md" ? "h-9 px-2.5 text-sm" : "h-7 px-2 text-xs")}>
      {label}
      <ChevronDown className={cn("shrink-0", size === "md" ? "size-4" : "size-3.5")} aria-hidden />
    </span>
  );
}

export function TranslationsView({ phase }: { phase: Phase }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="text-lg font-medium">{m.common.nav.translations}</span>
            <CountBadge count={fixture.keyCount} label={m.translations.keys(fixture.keyCount)} />
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className={buttonClass({ variant: "default" })}>
              <ArrowDownToLine className="text-neutral-600" aria-hidden />
              {m.repositorySync.action}
            </span>
            <span data-landing-publish="" aria-disabled={phase === "published" ? "true" : undefined} className={cn(buttonClass({ variant: "primary" }), phase === "published" && "bg-muted text-muted-foreground")}>
              <Send aria-hidden />
              {m.translations.publish.button}
              {phase !== "published" && <Swap phase={phase} before={<PublishCount n={fixture.unsentBefore} />} after={<PublishCount n={fixture.unsentAfter} />} />}
            </span>
            {phase === "published" && <span className={buttonClass({ variant: "default" })}>{m.translations.publish.viewResult}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 툴바는 검색 하나뿐이고 왼쪽에 선다 — Status는 키 목록 머리가 든다(2026-10-02). `search-input.tsx` — 320 입력 + 왼쪽 16 글리프. 값이 없어 placeholder가 보인다. */}
          <span data-landing-search="" className="relative flex">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4" aria-hidden />
            <span className={cn(fieldClass, "text-muted-foreground flex h-9 w-80 items-center pl-8")}>{w.filters.searchPlaceholder}</span>
          </span>
        </div>
        {phase !== "published" && (
          <div data-landing-hold="">
            <Alert variant="neutral" actions={<span className={buttonClass({ variant: "default" })}>{m.translations.banner.sendWithPublish}<ArrowUp className="size-3.5" aria-hidden /></span>}>
              <Swap phase={phase} before={m.translations.banner.paused(fixture.unsentBefore)} after={m.translations.banner.paused(fixture.unsentAfter)} />
            </Alert>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="flex h-full min-h-0">
          <div className="border-border bg-background relative flex min-h-0 w-[652px] shrink-0 overflow-hidden rounded-lg border">
            <SourceTree />
            <KeyList phase={phase} />
          </div>
          {/* 두 카드 사이 16px이 리사이즈 손잡이다 — 선을 그리지 않는다. */}
          <div className="w-4 shrink-0" />
          <div className="border-border bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border">
            <LocaleDetail phase={phase} />
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
function SourceTree() {
  const t = w.tree;
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
                <span className="flex text-neutral-600">{open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}</span>
                <span className="flex text-neutral-600"><FileJson2 className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 truncate font-medium">{source.slug}</span>
                <span className="text-muted-foreground text-xs">{count(source.keyCount)}</span>
              </span>
              {open && (
                <>
                  <TreeItem icon={<Layers className="size-3.5" aria-hidden />} label={t.allNamespaces} n={source.keyCount} selected />
                  {source.namespaces.map((namespace) => (
                    <TreeItem key={namespace.name} icon={<Folder className="size-3.5" aria-hidden />} label={namespace.name} n={namespace.keyCount} selected={false} />
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

/** 선택 면은 `ListItemButton selected`의 `bg-foreground/[0.07]`이다(DESIGN §5 — 키 목록 행과 같다, 5-Y7). `landing-mockup.test.tsx`가 실물을 렌더해 견준다. */
const SELECTED = "bg-foreground/[0.07]";

function TreeItem({ icon, label, n, selected }: { icon: ReactNode; label: string; n: number; selected: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 rounded-sm py-1.5 pr-2 pl-[30px] text-sm", selected && SELECTED)}>
      <span className="flex text-neutral-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs">{count(n)}</span>
    </span>
  );
}

function KeyList({ phase }: { phase: Phase }) {
  const list = w.list;
  const unsent = new Set<string>(fixture.diff.filter((row) => row.key !== fixture.selected.key).map((row) => row.key));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <span className="text-base font-medium">{list.keys}</span>
        <CountBadge count={current?.keyCount ?? 0} label={m.translations.keys(current?.keyCount ?? 0)} />
        {/* 이 목록을 좁히는 필터는 머리 오른쪽 끝이다 — 실물 `key-list.tsx`의 `filter` 자리(번역값 패널의 언어 메뉴와 같은 자리). 정렬 문구는 없다(2026-10-02). */}
        <span className="ml-auto flex">
          <FilterTrigger label={w.filters.state.any} size="sm" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {fixture.rows.map((row, index) => {
          const isSelected = row.key === fixture.selected.key;
          // 미번역은 이상이 아니라 할 일이라 회색이다(실물 `key-list.tsx` — 1-Y10).
          const missing = <span className="text-muted-foreground shrink-0 text-xs">{list.missing(row.missing)}</span>;
          const complete = <span className="text-muted-foreground shrink-0 text-xs">{list.complete}</span>;
          return (
            <div key={row.key} data-landing-row={row.key} className={cn("flex shrink-0 items-start gap-3 border-t px-4 py-3", index === 0 ? "border-divider" : "border-border", isSelected && SELECTED)}>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="text-sm leading-[1.45]">{row.text}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">{row.key}</span>
                  {phase !== "published" && unsent.has(row.key) && unsentBadge}
                  {isSelected && phase !== "published" && phase !== "missing" && phase !== "typing" && <Swap phase={phase} before={null} after={unsentBadge} />}
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
function LocaleDetail({ phase }: { phase: Phase }) {
  const d = w.detail;
  const selected = fixture.selected;
  const filled = selected.values.length;
  const total = filled + 1;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <FileJson2 className="size-4 shrink-0" aria-hidden />
          {fixture.source}
          <ChevronRight className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
          <span className="text-foreground min-w-0 truncate font-medium">{fixture.namespace}</span>
        </span>
        <span className="ml-auto">
          <FilterTrigger label={d.allLanguages} size="sm" />
        </span>
      </div>
      <div className="border-divider flex min-h-0 flex-1 flex-col overflow-hidden border-t">
        <div className="border-divider flex shrink-0 flex-col gap-1 border-b px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 text-base font-medium">{selected.key}</span>
            <Swap
              phase={phase}
              before={<span className="text-muted-foreground shrink-0 text-xs">{d.languages(filled, total)}</span>}
              after={<span className="text-muted-foreground shrink-0 text-xs">{d.languages(total, total)}</span>}
            />
            <span className={cn(buttonClass({ variant: "default", size: "sm" }), "h-7 min-w-7 gap-1 px-1.5")}>
              <Link2 className="size-3.5 text-neutral-600" aria-hidden />
            </span>
          </div>
          <span className="text-muted-foreground text-xs leading-normal">{selected.description}</span>
        </div>
        {/* ⚠️ 실제 앱은 이 목록이 스크롤한다 — 목업은 잘라서 푸터 위로 칠하지 않게 한다(#112). 행 예산은 셋이다. */}
        <div data-landing-locales="" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selected.values.map(({ code, value }, index) => (
            <LocaleRow key={code} code={code} first={index === 0} base={index === 0} status={null}>
              <span className="border-input bg-background min-h-[62px] rounded-md border px-2.5 py-2.5 text-sm leading-[1.55]">{value}</span>
            </LocaleRow>
          ))}
          <TypedRow phase={phase} />
        </div>
        <Footer phase={phase} />
      </div>
    </div>
  );
}

function LocaleRow({ code, first, base = false, status, children }: { code: string; first: boolean; base?: boolean; status: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-2 px-4 py-3", !first && "border-border border-t")}>
      <div className="flex items-center gap-2">
        <LocaleBadge code={code} orphaned={false} />
        {base && <span className="text-muted-foreground text-xs">{w.detail.source}</span>}
        <span className="ml-auto flex items-center gap-2">{status}</span>
      </div>
      {children}
    </div>
  );
}

/** `fr` 행 — ① 점선 안의 회색 원문 · ② 타이핑 · ③ 저장 전→후 · ④⑤ 저장됨(`Unsent` 배지). */
function TypedRow({ phase }: { phase: Phase }) {
  const selected = fixture.selected;
  const d = w.detail;
  const notSaved = <span className="text-xs text-amber-700">{d.notSaved}</span>;
  const notSent = unsentBadge;
  const status = phase === "published" ? null : phase === "missing" ? <span className="text-muted-foreground text-xs">{d.missing}</span> : phase === "typing" ? notSaved : <Swap phase={phase} before={notSaved} after={notSent} />;
  return (
    <LocaleRow code={selected.typedCode} first={false} status={status}>
      {phase === "missing" ? (
        <span className="text-muted-foreground min-h-[62px] rounded-md border border-dashed border-neutral-300 p-2.5 text-sm leading-[1.55]">{selected.text}</span>
      ) : (
        <span className={cn("border-input bg-background min-h-[62px] rounded-md border px-2.5 py-2.5 text-sm leading-[1.55]", phase === "typing" && "ring-ring ring-2")}>
          {phase === "typing" ? <span data-landing-typed="" /> : selected.typed}
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
function Footer({ phase }: { phase: Phase }) {
  const f = w.footer;
  const unsaved = <span className="text-xs text-amber-700">{f.unsaved(1)}</span>;
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
        <span className="flex min-w-0 flex-col">{text}</span>
        <span className="ml-auto inline-flex items-center gap-2">
          {phase === "saved" ? revert : phase === "saving" ? <Swap phase={phase} before={null} after={revert} /> : null}
          {phase === "typing" ? saveOn : phase === "saving" ? <Swap phase={phase} before={saveOn} after={saveOff} /> : saveOff}
        </span>
      </div>
    </div>
  );
}
