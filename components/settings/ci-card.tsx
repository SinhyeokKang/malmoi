"use client";
import { useRef, useState, type ReactNode } from "react";
import { OnboardingModal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FileCode2, ChevronRight } from "lucide-react";
import { PanelCard } from "@/components/ui/panel-card";
import { PushTokenPanel } from "./push-token-panel";
import { m } from "@/lib/i18n";
export function CiCard({ slug, archived, stale, children }: { slug: string; archived: boolean; stale: readonly string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <PanelCard title={m.settings.ci.title} subtitle={m.settings.ci.description}>
    <PushTokenPanel slug={slug} disabled={archived} />
    <div className="border-border border-t">
      <Button ref={trigger} variant="ghost" className="text-foreground focus-visible:ring-inset h-auto w-full justify-start gap-3 rounded-none px-4 py-[13px] text-left" disabled={archived || !children} onClick={() => setOpen(true)}>
        <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded"><FileCode2 className="size-4" aria-hidden /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="text-base font-medium">{m.settings.ci.workflow}</span><span className="text-mono text-muted-foreground text-xs">.github/workflows/malmoi-i18n.yml</span></span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Button>
    </div>
    {archived && <p className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.archivedReason}</p>}
    {stale.length > 0 && <p className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.ci.stale} {stale.join(", ")}</p>}
    <OnboardingModal open={open && !archived} onClose={() => setOpen(false)} returnFocusRef={trigger} bodyScroll="hidden" title={m.settings.ci.workflow} description={m.settings.workflow.saveAs(".github/workflows/malmoi-i18n.yml")} panelClassName="h-[min(640px,calc(100svh-96px))] min-h-0" actions={<Button size="lg" onClick={() => setOpen(false)}>{m.common.dismiss}</Button>}>
      {children}
      <p className="text-muted-foreground text-xs leading-[1.6]">{m.settings.workflow.hookHint(<span className="text-mono">useTranslations()</span>, <span className="text-mono">wrapper</span>, <span className="text-mono">docs/ACTIONS.md</span>)}</p>
    </OnboardingModal>
  </PanelCard>;
}
