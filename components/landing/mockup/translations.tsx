import { ArrowDownToLine, ChevronDown, ChevronRight, FileJson2, Link2, Send } from "lucide-react";
import type { ReactNode } from "react";

import { LocaleBadge } from "@/components/translations/locale-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 목업의 번역 화면 — 실제 `components/translations/workspace/`(머리 · 키 목록 · 로케일 상세 · 저장 푸터)의 **정적 복제**다.
 *
 * `phase`가 씬 ①②③을 가른다: `missing`(fr 빈 칸) · `typing`(스테이지가 `[data-landing-typed]`에 접두를 쓴다) · `saving`(씬 ③ —
 * 프레임의 `data-badge`가 서는 순간 저장되고 Publish 배지가 는다) · `saved`(④⑤의 배경).
 *
 * ⚠️ 버튼 모양은 `buttonClass`를 `<span>`에 입힌다 — 목업은 조작 대상이 아니다(`repository-card.tsx` 선례).
 */
export type Phase = "missing" | "typing" | "saving" | "saved";

const fixture = m.landing.mockup;
const w = m.translations.workspace;
const count = (n: number) => n.toLocaleString("en-US");

/** 씬 ③의 전·후 — 프레임의 `data-badge`가 1이 되는 순간 바뀐다(`group/frame`은 `components/landing/stage.tsx`). */
function Swap({ phase, before, after, display = "inline-flex" }: { phase: Phase; before: ReactNode; after: ReactNode; display?: "inline-flex" | "flex" }) {
  if (phase === "saved") return <>{after}</>;
  if (phase !== "saving") return <>{before}</>;
  return (
    <>
      <span data-landing-badge="before" className={cn(display, "group-data-[badge=1]/frame:hidden")}>{before}</span>
      <span data-landing-badge="after" className={cn("hidden", display === "flex" ? "group-data-[badge=1]/frame:flex" : "group-data-[badge=1]/frame:inline-flex")}>{after}</span>
    </>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="border-border inline-flex shrink-0 items-center rounded-full border px-[7px] py-px text-xs whitespace-nowrap text-neutral-600">{children}</span>;
}

function PublishCount({ n }: { n: number }) {
  return <span className="bg-background/20 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-px text-xs">{count(n)}</span>;
}

export function TranslationsView({ phase }: { phase: Phase }) {
  const selected = fixture.selected;
  const filled = selected.values.length;
  const total = filled + 1;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 flex-col gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="text-lg font-medium">{m.common.nav.translations}</span>
            <Badge variant="neutral">{count(fixture.keyCount)}</Badge>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className={buttonClass({ variant: "default" })}>
              <ArrowDownToLine className="text-neutral-600" aria-hidden />
              {m.repositorySync.action}
            </span>
            <span className={buttonClass({ variant: "primary" })}>
              <Send aria-hidden />
              {m.translations.publish.button}
              <Swap phase={phase} before={<PublishCount n={fixture.unsentBefore} />} after={<PublishCount n={fixture.unsentAfter} />} />
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={buttonClass({ variant: "default" })}>
            {w.filters.completion.all}
            <ChevronDown className="text-muted-foreground" aria-hidden />
          </span>
          <span className={buttonClass({ variant: "default" })}>
            {w.filters.state.any}
            <ChevronDown className="text-muted-foreground" aria-hidden />
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <KeyList phase={phase} />
        <div className="border-border flex min-h-0 min-w-0 flex-1 flex-col border-l">
          <div className="flex h-[53px] shrink-0 items-center gap-2 px-4">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
              <FileJson2 className="size-4 shrink-0" aria-hidden />
              {fixture.source}
              <ChevronRight className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
              <span className="text-foreground font-medium">{fixture.namespace}</span>
            </span>
            <span className={cn(buttonClass({ variant: "default", size: "sm" }), "ml-auto")}>
              {w.detail.allLanguages}
              <ChevronDown className="text-muted-foreground" aria-hidden />
            </span>
          </div>
          <div className="border-divider flex min-h-0 flex-1 flex-col border-t">
            <div className="border-divider flex shrink-0 items-center gap-2.5 border-b px-4 py-3.5">
              <span className="min-w-0 flex-1 text-base font-medium">{selected.key}</span>
              <Swap
                phase={phase}
                before={<span className="shrink-0 text-xs text-amber-700">{w.detail.languages(filled, total)}</span>}
                after={<span className="text-muted-foreground shrink-0 text-xs">{w.detail.languages(total, total)}</span>}
              />
              <span className={cn(buttonClass({ variant: "default", size: "sm" }), "h-7 min-w-7 px-1.5")}>
                <Link2 className="size-3.5 text-neutral-600" aria-hidden />
              </span>
            </div>
            {/* ⚠️ 실제 앱은 이 목록이 스크롤한다 — 목업은 잘라서 푸터 위로 칠하지 않게 한다(#112). 행 예산은 셋이다. */}
            <div data-landing-locales="" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {selected.values.map(({ code, value }, index) => (
                <LocaleRow key={code} code={code} first={index === 0} status={index === 0 ? <span className="text-muted-foreground text-xs">{w.detail.source}</span> : null}>
                  <span className="border-input rounded-md border px-2.5 py-2.5 text-sm leading-[1.55]">{value}</span>
                </LocaleRow>
              ))}
              <TypedRow phase={phase} />
            </div>
            <Footer phase={phase} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LocaleRow({ code, first, status, children }: { code: string; first: boolean; status: ReactNode; children: ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-2 px-4 py-3", !first && "border-border border-t")}>
      <div className="flex items-center gap-2">
        <LocaleBadge code={code} orphaned={false} />
        <span className="ml-auto flex items-center gap-2">{status}</span>
      </div>
      {children}
    </div>
  );
}

/** `fr` 행 — ① 점선 안의 회색 원문 · ② 타이핑 · ③ 저장 전→후 · ④⑤ 저장됨. */
function TypedRow({ phase }: { phase: Phase }) {
  const selected = fixture.selected;
  const d = w.detail;
  const notSaved = <span className="text-xs text-amber-700">{d.notSaved}</span>;
  const notSent = <Pill>{w.list.notSent}</Pill>;
  const status = phase === "missing" ? <span className="text-xs text-amber-700">{d.missing}</span> : phase === "typing" ? notSaved : <Swap phase={phase} before={notSaved} after={notSent} />;
  return (
    <LocaleRow code={selected.typedCode} first={false} status={status}>
      {phase === "missing" ? (
        <span className="text-muted-foreground min-h-[62px] rounded-md border border-dashed border-neutral-300 p-2.5 text-sm leading-[1.55]">{selected.text}</span>
      ) : (
        <span className="border-input min-h-[62px] rounded-md border px-2.5 py-2.5 text-sm leading-[1.55]">
          {phase === "typing" ? <span data-landing-typed="" /> : selected.typed}
          {phase === "typing" && <span className="bg-foreground ml-px inline-block h-4 w-px translate-y-[3px]" />}
        </span>
      )}
    </LocaleRow>
  );
}

function Footer({ phase }: { phase: Phase }) {
  const f = w.footer;
  const unsaved = <span className="text-xs text-amber-700">{f.unsaved(1)}</span>;
  const saved = <span className="text-muted-foreground text-xs">{f.savedNotSent}</span>;
  const text = phase === "missing" ? null : phase === "typing" ? unsaved : <Swap phase={phase} before={unsaved} after={saved} />;
  return (
    <div className="border-divider mt-auto flex shrink-0 items-center gap-3 border-t px-4 py-3">
      {text}
      <span className={cn(buttonClass({ variant: "primary" }), "ml-auto", (phase === "missing" || phase === "saved") && "bg-muted text-muted-foreground")}>{f.save}</span>
    </div>
  );
}

function KeyList({ phase }: { phase: Phase }) {
  const list = w.list;
  const unsent = new Set<string>(fixture.diff.filter((row) => row.key !== fixture.selected.key).map((row) => row.key));
  return (
    <div className="flex w-[440px] shrink-0 flex-col">
      <div className="flex h-[53px] shrink-0 items-center gap-2 px-4">
        <span className="text-base font-medium">{list.keys}</span>
        <Badge variant="neutral">{count(fixture.keyCount)}</Badge>
        <span className="text-muted-foreground ml-auto text-xs">{list.incompleteFirst}</span>
      </div>
      <div className="flex flex-col">
        {fixture.rows.map((row, index) => {
          const isSelected = row.key === fixture.selected.key;
          const missing = <span className="shrink-0 text-xs text-amber-700">{list.missing(row.missing)}</span>;
          const complete = <span className="text-muted-foreground shrink-0 text-xs">{list.complete}</span>;
          return (
            <div key={row.key} className={cn("flex items-start gap-3 border-t px-4 py-3", index === 0 ? "border-divider" : "border-border", isSelected && "bg-foreground/[0.04]")}>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="text-sm leading-[1.45]">{row.text}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">{row.key}</span>
                  {unsent.has(row.key) && <Pill>{list.notSent}</Pill>}
                  {isSelected && phase !== "missing" && phase !== "typing" && <Swap phase={phase} before={null} after={<Pill>{list.notSent}</Pill>} />}
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
