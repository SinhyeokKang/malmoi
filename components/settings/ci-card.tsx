"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { ListRow } from "@/components/ui/list-row";
import { cn } from "@/lib/utils";

import { routes } from "@/lib/routes";
import { useId, useRef, useState, type ReactNode } from "react";
import { LargeModal } from "@/components/ui/large-modal";
import { Button } from "@/components/ui/button";
import { FileCode2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PushTokenPanel } from "./push-token-panel";
import { m } from "@/lib/i18n";
import { IconTile } from "@/components/ui/icon-tile";
export function CiCard({ slug, archived, unpinned = false, stale, children }: { slug: string; archived: boolean; unpinned?: boolean; stale: readonly string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const archivedId = useId();
  const noSourcesId = useId();
  /*
    ⚠️ **꺼진 워크플로 행은 `aria-disabled` + 사유다** (audit #37 — DESIGN §6.65). 진짜 `disabled`는 포커스를 못 받아 왜 못 여는지
    닿지 않았다. 보관이 먼저다 — 보관된 프로젝트는 소스가 있어도 못 연다.
  */
  const blocked = archived ? archivedId : !children ? noSourcesId : undefined;
  // 누를 수 있는 행의 hover 면(4-Y12)은 막힌 행에 서지 않는다 — `ghost`는 `aria-disabled` hover를 잠그지 않는다(`button.tsx`).
  // ⚠️ `aria-disabled:` 철자로 끄지 않는다 — 그 변형은 `buttonClass` 밖에서 금지다(`disabled-pairing.test.ts`). 막힌 동안 클래스를 빼는다.
  return <Card title={m.settings.ci.title} description={m.settings.ci.description}>
    <PushTokenPanel slug={slug} disabled={archived} unpinned={unpinned} />
    <div className="border-border border-t">
      <ListRow as="button" chevron ringInset className={cn("text-foreground text-sm transition-colors", blocked !== undefined && "cursor-not-allowed")} ref={trigger} aria-disabled={blocked !== undefined || undefined} aria-describedby={blocked} onClick={() => { if (blocked === undefined) setOpen(true); }}>
        <IconTile><FileCode2 aria-hidden /></IconTile>
        <span className="flex min-w-0 flex-1 flex-col gap-copy-gap"><span className="text-base font-medium">{m.settings.ci.workflow}</span><span className="text-muted-foreground text-xs">.github/workflows/malmoi-i18n.yml</span></span>
      </ListRow>
    </div>
    {/*
      ⚠️ **낱말 하나가 아니라 문장이다** (Sources 시안 §13-2 — 소스 카드를 걷은 자리의 안내). `Sources` 한 낱말만
      서면 무엇으로 가는 링크인지 읽히지 않았다. 워크플로 행 바로 아래라 "한 워크플로가 전부 덮는다"가 이어 읽힌다.
    */}
    <p className="border-border text-muted-foreground border-t px-4 py-row-y text-xs">{m.settings.ci.sourcesLead} <InlineLink href={routes.sources(slug)}>{m.sources.title}</InlineLink>.</p>
    {archived && <p id={archivedId} className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.archivedReason}</p>}
    {!archived && !children && <p id={noSourcesId} className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.ci.noSources}</p>}
    {stale.length > 0 && <p className="text-muted-foreground px-4 pb-3.5 text-xs">{m.settings.ci.stale} {stale.join(", ")}</p>}
    {/* ⚠️ 모달 `description`을 두지 않는다 — 저장 경로 문장은 `WorkflowBlock` 머리(Copy 옆)가 든다. 온보딩 ④와 같은 형이다(#120). */}
    <LargeModal open={open && !archived} onClose={() => setOpen(false)} returnFocusRef={trigger} bodyScroll="hidden" title={m.settings.ci.workflow} className="h-[min(640px,calc(100svh-var(--spacing-modal-gutter)))] min-h-0" actions={<Button size="lg" onClick={() => setOpen(false)}>{m.common.close}</Button>}>
      {children}
      <p className="text-muted-foreground text-xs leading-body">{m.settings.workflow.hookHint("useTranslations()", "wrapper", <InlineLink href={routes.docs("setup/workflow", "workflow")}>{m.settings.workflow.hookDoc}</InlineLink>)}</p>
    </LargeModal>
  </Card>;
}
