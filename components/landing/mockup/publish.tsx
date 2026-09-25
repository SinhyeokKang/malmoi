import { FileJson2, GitPullRequestArrow, Info, Send, X } from "lucide-react";
import type { ReactNode } from "react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { diffWords } from "@/lib/publish/words";
import { cn } from "@/lib/utils";

/**
 * 목업의 Publish 모달 둘 — 씬 ④ 미리보기(`1a`)와 씬 ⑤ 결과(`1d`)의 **정적 복제**다(`components/publish-button.tsx` ·
 * Claude Design `design_handoff_publish_modal`). 제목·라벨·수 문장은 실제 사전(`m.translations.publish`)을 읽는다.
 *
 * ⚠️ 실제 모달은 `<table>`이지만 여기는 `aria-hidden` 프레임 안의 그림이라 시맨틱을 복제하지 않는다 — 칸 폭(220 · 84)만 맞춘다.
 */
const fixture = m.landing.mockup;
const p = m.translations.publish;

function Shell({ title, description, children, meta, actions }: { title: string; description: string; children: ReactNode; meta: ReactNode; actions: ReactNode }) {
  return (
    <div className="bg-background shadow-medium flex h-[560px] w-[880px] flex-col overflow-hidden rounded-xl">
      <div className="flex items-start justify-between gap-2 px-8 pt-8 pb-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xl font-medium">{title}</span>
          <span className="text-muted-foreground text-sm">{description}</span>
        </div>
        <span className="flex size-9 items-center justify-center rounded-full">
          <X className="size-5" aria-hidden />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-8">{children}</div>
      <div className="border-divider mt-5 flex items-center justify-between gap-2 border-t px-8 py-6">
        <span className="text-muted-foreground text-xs leading-[1.6]">{meta}</span>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

function DiffLine({ sign, parts, before = false }: { sign: string; parts: readonly { text: string; changed: boolean }[]; before?: boolean }) {
  return (
    <span className="flex items-start gap-2">
      <span className={cn("w-2.5 shrink-0 text-xs leading-5", before ? "text-red-700" : "text-green-800")}>{sign}</span>
      <span className={cn("min-w-0 flex-1 text-sm leading-5", before && "text-muted-foreground")}>
        {parts.map((part, i) => (
          <span key={i} className={!part.changed ? undefined : before ? "text-foreground rounded-[3px] bg-red-700/[0.14]" : "rounded-[3px] bg-green-800/[0.16]"}>
            {part.text}
          </span>
        ))}
      </span>
    </span>
  );
}

export function PreviewModal() {
  const rows = fixture.diff;
  return (
    <Shell
      title={p.previewTitle(rows.length)}
      description={p.previewIntro(fixture.repo)}
      meta={p.previewSummary(rows.length, rows.length, rows.length)}
      actions={
        <>
          <span className={buttonClass({ variant: "default" })}>{m.common.cancel}</span>
          <span className={buttonClass({ variant: "primary" })}>
            <Send aria-hidden />
            {p.button}
          </span>
        </>
      }
    >
      <div className="border-border flex flex-col overflow-hidden rounded-lg border">
        <div className="bg-primary-foreground border-border text-muted-foreground flex border-b text-xs">
          <span className="border-divider w-[220px] border-r px-3.5 py-[9px]">{p.key}</span>
          <span className="border-divider w-[84px] border-r px-3 py-[9px]">{p.locale}</span>
          <span className="px-3.5 py-[9px]">{p.value}</span>
        </div>
        {rows.map((row) => {
          const diff = diffWords(row.before ?? "", row.after);
          return (
            <div key={row.file} className="flex flex-col">
              <span className="border-border bg-primary-foreground flex items-center gap-2 border-b px-3.5 py-[9px] text-xs">
                <FileJson2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                {row.file}
                <span className="text-muted-foreground ml-auto">{p.fileSummary(1, 1)}</span>
              </span>
              <div className="border-border flex border-b last:border-b-0">
                <span className="border-divider w-[220px] shrink-0 border-r px-3.5 py-[11px] text-xs">{row.key}</span>
                <span className="border-divider flex w-[84px] shrink-0 items-start gap-2 border-r px-3 py-[11px]">
                  <span className="mt-[5px] flex">
                    <LocaleFlag code={row.code} />
                  </span>
                  <span className="text-xs leading-5 font-medium">{row.code}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px] px-3.5 py-[11px]">
                  {/* 전·후 라벨은 실제 모달에서 sr-only다 — 목업에선 글리프가 그 자리를 보여 준다. */}
                  <span className="sr-only">{p.beforeLabel}</span>
                  {row.before !== null && <DiffLine sign="−" parts={diff.before} before />}
                  <span className="sr-only">{p.afterLabel}</span>
                  <DiffLine sign="+" parts={diff.after} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

export function ResultModal() {
  const rows = fixture.diff.length;
  return (
    <Shell
      title={p.created}
      description={p.createdDescription(rows)}
      meta={p.prMeta(fixture.pullRequest, rows)}
      actions={<span className={buttonClass({ variant: "primary" })}>{p.viewLink}</span>}
    >
      <div className="border-border flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3.5">
        <GitPullRequestArrow className="size-4 shrink-0 text-green-800" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm">{`${fixture.repo} #${fixture.pullRequest}`}</span>
          <span className="text-muted-foreground text-xs">{p.openedJustNow}</span>
        </span>
        <Badge variant="success">{p.prState}</Badge>
      </div>
      <div className="text-muted-foreground flex gap-2.5 text-xs leading-[1.6]">
        <span className="flex h-[21px] shrink-0 items-center">
          <Info className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">{p.accessNote}</span>
      </div>
    </Shell>
  );
}
