import { Archive, ArrowRight } from "lucide-react";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { PanelCard } from "@/components/ui/panel-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { utcMinute } from "@/lib/utc-time";

/**
 * 보관된 프로젝트의 Sources (시안 `1g`).
 *
 * ⚠️ **목록·상세를 열지 않는다** — 안내 한 장이고, 그 판정은 페이지가 조회 **전에** 한다.
 * ⚠️ **[Add source]를 꺼서 두지 않고 아예 뺀다** — 본문이 안내뿐인 화면에서 꺼진 버튼은 장식이다.
 * ⚠️ **EDITOR에게 Settings 링크를 주지 않는다** — 그 화면이 EDITOR에게는 `/projects?e=forbidden`이라
 * 누르라고 말한 이름의 컨트롤이 같은 화면에 없는 형이 된다(POSTMORTEM 2026-09-14).
 */
export function SourcesArchived({ slug, role, archivedAt }: { slug: string; role: Role; archivedAt: Date | null }) {
  const canEdit = canPerform(role, "project:settings");
  return <div className="flex min-h-0 flex-1 flex-col">
    <PanelHeader width="fluid"><div className="flex items-center gap-3">
      <span className="flex items-center gap-2"><h1 className="text-lg font-medium">{m.sources.title}</h1><Badge variant="neutral">{m.logs.archived.badge}</Badge></span>
    </div></PanelHeader>
    <PanelBody width="fluid">
      <PanelCard title={m.sources.title}>
        <div className="border-divider flex items-center gap-3 border-t px-4 py-[13px]">
          <span className="bg-foreground/5 flex size-7 shrink-0 items-center justify-center rounded text-neutral-600"><Archive className="size-4" aria-hidden /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-base"><span className="font-medium">{m.logs.archived.badge}</span>{archivedAt && <> — <time dateTime={archivedAt.toISOString()} aria-label={utcMinute(archivedAt)}>{utcMinute(archivedAt)}</time></>}</span>
            <span className="text-muted-foreground text-xs">{canEdit ? m.sources.archivedOwner : m.sources.archivedEditor}</span>
          </span>
          {canEdit && <ButtonLink className="shrink-0" href={routes.settings(slug)}>{m.common.nav.projectSettings}<ArrowRight className="text-muted-foreground size-3.5" aria-hidden /></ButtonLink>}
        </div>
      </PanelCard>
    </PanelBody>
  </div>;
}
