import { Archive, ChevronRight } from "lucide-react";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { utcDay } from "@/lib/utc-time";
import { IconTile } from "@/components/ui/icon-tile";

/**
 * 보관된 프로젝트의 Sources (시안 `1g`).
 *
 * ⚠️ **목록·상세를 열지 않는다** — 안내 한 장이고, 그 판정은 페이지가 조회 **전에** 한다.
 * ⚠️ **[Add source]를 꺼서 두지 않고 아예 뺀다** — 본문이 안내뿐인 화면에서 꺼진 버튼은 장식이다.
 * ⚠️ **EDITOR에게 Settings 링크를 주지 않는다** — 그 화면이 EDITOR에게는 `/projects?e=forbidden`이라
 * 누르라고 말한 이름의 컨트롤이 같은 화면에 없는 형이 된다(POSTMORTEM 2026-09-14).
 * ⚠️ **보관 시각은 날짜다** — Settings 보관 카드와 같은 `utcDay`(2-Y19). 정확한 값은 `dateTime`이 든다.
 * ⚠️ **출구 낱말은 "Open settings" 하나다**(4-Y24 — 보관 화면 전부가 `m.archive.empty.action`) · 앱 안 이동이라 chevron이다(4-Y23).
 */
export function SourcesArchived({ slug, role, archivedAt }: { slug: string; role: Role; archivedAt: Date | null }) {
  const canEdit = canPerform(role, "project:settings");
  return <div className="flex min-h-0 flex-1 flex-col">
    <PanelHeader><div className="flex items-center gap-3">
      <span className="flex items-center gap-2"><h1 className="text-lg font-medium">{m.sources.title}</h1><StatusBadge state="archived" /></span>
    </div></PanelHeader>
    <PanelBody>
      <Card title={m.sources.title}>
        <div className="flex items-center gap-3 px-4 py-row-y">
          <IconTile><Archive aria-hidden /></IconTile>
          <span className="flex min-w-0 flex-1 flex-col gap-copy-gap">
            <span className="text-base"><span className="font-medium">{m.logs.archived.badge}</span>{archivedAt && <> — <time dateTime={archivedAt.toISOString()}>{utcDay(archivedAt)}</time></>}</span>
            <span className="text-muted-foreground text-xs">{canEdit ? m.sources.archivedOwner : m.sources.archivedEditor}</span>
          </span>
          {canEdit && <ButtonLink className="shrink-0" href={routes.settings(slug)}>{m.archive.empty.action}<ChevronRight className="text-muted-foreground size-3.5" aria-hidden /></ButtonLink>}
        </div>
      </Card>
    </PanelBody>
  </div>;
}
