"use client";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { useId, useRef, useState, type ReactNode } from "react";
import { OnboardingModal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FileCode2, ChevronRight } from "lucide-react";
import { PanelCard } from "@/components/ui/panel-card";
import { PushTokenPanel } from "./push-token-panel";
import { m } from "@/lib/i18n";
export function CiCard({ slug, archived, stale, children }: { slug: string; archived: boolean; stale: readonly string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const archivedId = useId();
  const noSourcesId = useId();
  /*
    ⚠️ **꺼진 워크플로 행은 `aria-disabled` + 사유다** (audit #37 — DESIGN §6.65). 진짜 `disabled`는 포커스를 못 받아 왜 못 여는지
    닿지 않았다. 보관이 먼저다 — 보관된 프로젝트는 소스가 있어도 못 연다.
  */
  const blocked = archived ? archivedId : !children ? noSourcesId : undefined;
  return <PanelCard title={m.settings.ci.title} subtitle={m.settings.ci.description}>
    <PushTokenPanel slug={slug} disabled={archived} />
    <div className="border-border border-t">
      <Button ref={trigger} variant="ghost" className="text-foreground focus-visible:ring-inset h-auto w-full justify-start gap-3 rounded-none px-4 py-[13px] text-left" aria-disabled={blocked !== undefined || undefined} aria-describedby={blocked} onClick={() => { if (blocked === undefined) setOpen(true); }}>
        <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded"><FileCode2 className="size-4" aria-hidden /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="text-base font-medium">{m.settings.ci.workflow}</span><span className="text-muted-foreground text-xs">.github/workflows/malmoi-i18n.yml</span></span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Button>
    </div>
    {/*
      ⚠️ **낱말 하나가 아니라 문장이다** (Sources 시안 §13-2 — 소스 카드를 걷은 자리의 안내). `Sources` 한 낱말만
      서면 무엇으로 가는 링크인지 읽히지 않았다. 워크플로 행 바로 아래라 "한 워크플로가 전부 덮는다"가 이어 읽힌다.
    */}
    <p className="border-border text-muted-foreground border-t px-4 py-[13px] text-xs">{m.settings.ci.sourcesLead} <Link className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none" href={routes.sources(slug)}>{m.sources.title}</Link>.</p>
    {archived && <p id={archivedId} className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.archivedReason}</p>}
    {!archived && !children && <p id={noSourcesId} className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.ci.noSources}</p>}
    {stale.length > 0 && <p className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.ci.stale} {stale.join(", ")}</p>}
    <OnboardingModal open={open && !archived} onClose={() => setOpen(false)} returnFocusRef={trigger} bodyScroll="hidden" title={m.settings.ci.workflow} description={m.settings.workflow.saveAs(".github/workflows/malmoi-i18n.yml")} panelClassName="h-[min(640px,calc(100svh-96px))] min-h-0" actions={<Button size="lg" onClick={() => setOpen(false)}>{m.common.dismiss}</Button>}>
      {children}
      <p className="text-muted-foreground text-xs leading-[1.6]">{m.settings.workflow.hookHint("useTranslations()", "wrapper", <Link className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none" href={`${routes.docs()}#workflow`}>{m.settings.workflow.hookDoc}</Link>)}</p>
    </OnboardingModal>
  </PanelCard>;
}
