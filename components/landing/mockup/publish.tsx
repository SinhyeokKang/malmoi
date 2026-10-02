import { FileJson2, GitPullRequestArrow, Info, X } from "lucide-react";
import type { ReactNode } from "react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { m } from "@/lib/i18n";
import { diffWords } from "@/lib/publish/words";
import { cn } from "@/lib/utils";

/**
 * 목업의 Publish 모달 둘 — 씬 ④ 미리보기(`preview-ready`, 열린 PR 없음)와 씬 ⑤ 결과(`created`)의 **정적 복제**다
 * (`components/publish-button.tsx`의 `PublishModal` · 껍데기는 `components/ui/modal.tsx`의 `OnboardingModal`). 제목·라벨·수 문장은
 * 실제 사전(`m.translations.publish`)을 읽는다.
 *
 * 치수는 껍데기의 것이다 — 폭 `min(100% − 96, 1024)`, 높이는 갈래별 하한(미리보기 620 · 결과 420), 머리 `px-8 pt-8 pb-5`, 본문 `gap-4 px-8 pb-6`,
 * 바닥 `border-t px-8 py-6`. 확정 버튼은 **하나**이고 `lg`다(Cancel이 없다 — 닫기는 머리의 ×).
 *
 * ⚠️ 실제 모달은 `<table>`이지만 여기는 `aria-hidden` 프레임 안의 그림이라 시맨틱을 복제하지 않는다 — 칸 폭(220 · 84)만 맞춘다.
 */
const fixture = m.landing.mockup;
const p = m.translations.publish;

function Shell({ title, description, children, meta, action, tall }: { title: string; description: string; children: ReactNode; meta: ReactNode; action: ReactNode; tall: boolean }) {
  return (
    <div className={cn("bg-background shadow-medium flex w-[1024px] flex-col overflow-hidden rounded-xl", tall ? "h-[620px]" : "h-[420px]")}>
      <div className="flex items-start justify-between gap-2 px-8 pt-8 pb-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xl font-medium">{title}</span>
          <span className="text-muted-foreground text-sm text-pretty">{description}</span>
        </div>
        {/* `CloseButton`과 같은 클래스다(태그만 `<span>` — 프레임 안에 인터랙티브 태그를 두지 않는다). `landing-mockup.test.tsx`가 실물을 렌더해 견준다. */}
        <span className={cn(buttonClass({ variant: "ghost" }), "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none", "hover:bg-foreground/[0.03] size-9 shrink-0 rounded-full px-0")}>
          <X className="size-5" aria-hidden />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-8 pt-0.5 pb-6">{children}</div>
      <div className="border-divider flex items-center justify-between gap-2 border-t px-8 py-6">
        <span className="text-muted-foreground text-xs leading-[1.6]">{meta}</span>
        <div className="flex items-center gap-2">{action}</div>
      </div>
    </div>
  );
}

function DiffLine({ sign, parts, before = false }: { sign: string; parts: readonly { text: string; changed: boolean }[]; before?: boolean }) {
  return (
    <span className="flex gap-2">
      {/* 전·후 라벨은 실제 모달에서 sr-only다 — 목업에선 글리프가 그 자리를 보여 준다. */}
      <span className="sr-only">{before ? p.beforeLabel : p.afterLabel}</span>
      <span className={cn("w-2.5 shrink-0 text-xs leading-5", before ? "text-red-700" : "text-green-800")}>{sign}</span>
      <span className={cn("min-w-0 flex-1 text-sm leading-5 break-words whitespace-pre-wrap", before && "text-muted-foreground")}>
        {parts.map((part, i) => (
          <span key={i} className={!part.changed ? undefined : before ? "text-foreground rounded-[3px] bg-red-700/[0.14]" : "rounded-[3px] bg-green-800/[0.16]"}>
            {part.text}
          </span>
        ))}
      </span>
    </span>
  );
}

/** 네임스페이스 접두를 muted로 내린다(`publish-button.tsx`의 `namespaceOf`). */
function KeyName({ name }: { name: string }) {
  const dot = name.indexOf(".");
  const namespace = dot < 0 ? "" : name.slice(0, dot + 1);
  return (
    <span className="block truncate text-xs">
      <span className="text-muted-foreground">{namespace}</span>
      {name.slice(namespace.length)}
    </span>
  );
}

export function PreviewModal() {
  const rows = fixture.diff;
  const keys = new Set(rows.map((row) => row.key)).size;
  return (
    <Shell
      tall
      title={p.previewTitle(rows.length)}
      description={`${p.previewIntro(fixture.repo)} ${p.previewCounts(rows.length, keys)}`}
      meta={p.previewSummary(rows.length, keys, rows.length)}
      action={<span className={buttonClass({ variant: "primary", size: "lg" })}>{p.openPr}</span>}
    >
      <Alert variant="neutral" className="shrink-0" title={p.prNone.title(fixture.repo)}>{p.prNone.body(rows.length)}</Alert>
      <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="bg-primary-foreground border-border text-muted-foreground flex border-b text-xs">
          <span className="border-divider w-[220px] shrink-0 border-r px-3.5 py-[9px]">{p.key}</span>
          <span className="border-divider w-[84px] shrink-0 border-r px-3 py-[9px]">{p.locale}</span>
          <span className="px-3.5 py-[9px]">{p.value}</span>
        </div>
        {rows.map((row) => {
          const diff = diffWords(row.before ?? "", row.after);
          // 선택 키의 `fr`은 보는 사람이 ②③에서 쓴 값이고, 나머지는 동료의 편집이다.
          const author = row.key === fixture.selected.key ? fixture.user : fixture.teammate;
          return (
            <div key={row.code} className="flex flex-col">
              <span data-landing-file={fixture.file(row.code)} className="border-border bg-primary-foreground flex items-center gap-2 border-b px-3.5 py-[9px] text-xs">
                <FileJson2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{fixture.file(row.code)}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{p.fileSummary(1, 1)}</span>
              </span>
              <div className="flex border-b last:border-b-0 border-border">
                <span className="border-divider w-[220px] shrink-0 border-r px-3.5 py-[11px]">
                  <KeyName name={row.key} />
                </span>
                <span className="border-divider flex w-[84px] shrink-0 items-start gap-2 border-r px-3 py-[11px]">
                  <span data-landing-diff-flag="" className="mt-[5px] flex rounded-xs ring-1 ring-foreground/[0.06]">
                    <LocaleFlag code={row.code} />
                  </span>
                  <span className="text-xs leading-5 font-medium">{row.code}</span>
                </span>
                <span className="flex min-w-0 flex-1 items-start gap-2.5 px-3.5 py-[11px]">
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    {row.before !== null && <DiffLine sign="−" parts={diff.before} before />}
                    <DiffLine sign="+" parts={diff.after} />
                  </span>
                  <span data-landing-author="" className="text-muted-foreground shrink-0 text-xs leading-5">{author}</span>
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
      tall={false}
      title={p.created}
      description={p.createdDescription(rows)}
      meta={p.prMeta(fixture.pullRequest, rows)}
      action={<span className={buttonClass({ variant: "primary", size: "lg" })}>{p.viewLink}</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* 실물 `PrCard`(`publish-button.tsx`)와 같은 형이다 — 열린 PR은 정보라 회색이고 배지는 상태 키가 든다(🔴 G · §2.4 PR 열림). */}
        <div className="border-border flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3.5">
          <GitPullRequestArrow className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm">{`${fixture.repo} #${fixture.pullRequest}`}</span>
            <span className="text-muted-foreground text-xs">{p.openedJustNow}</span>
          </span>
          <StatusBadge state="prOpen" />
        </div>
        <div className="text-muted-foreground flex gap-2.5 text-xs leading-[1.6]">
          <span className="flex h-[21px] shrink-0 items-center">
            <Info className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">{p.accessNote}</span>
        </div>
      </div>
    </Shell>
  );
}
