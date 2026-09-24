"use client";
import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { surfaceLabel } from "@/lib/surfaces/plan";

export type SurfaceOption = { slug: string; pathTemplate: string | null; unpublished: number };
export function SurfaceSelector({ value, surfaces, pending, onChange }: {
  value: string; surfaces: readonly SurfaceOption[]; pending: boolean; onChange: (slug: string) => void;
}) {
  const pathId = useId();
  if (surfaces.length < 2) return null;
  const path = surfaces.find(s => s.slug === value)?.pathTemplate ?? null;
  // ⚠️ 닫힌 선택기의 전체 경로는 `title`(hover)만이 아니라 description으로도 닿는다 (audit #38 — DESIGN §7의 tooltip 줄).
  return <Select value={value} disabled={pending} onValueChange={onChange}>
    {path !== null && <span id={pathId} className="sr-only">{path}</span>}
    <SelectTrigger className="w-48" aria-label={m.surfaces.label} aria-describedby={path === null ? undefined : pathId} title={path ?? undefined}>
      <SelectValue>{(() => { const current = surfaces.find(s => s.slug === value); return current?.pathTemplate ? surfaceLabel(current.pathTemplate) : value; })()}</SelectValue>
    </SelectTrigger>
    <SelectContent>{surfaces.map(surface => <SelectItem key={surface.slug} value={surface.slug}>
      <span title={surface.pathTemplate ?? undefined} className="flex items-center gap-2">
        <span className="flex flex-col items-start">
          <span>{surface.pathTemplate === null ? surface.slug : surfaceLabel(surface.pathTemplate)}</span>
          {surface.pathTemplate !== null && <span className="text-muted-foreground text-xs">{surface.pathTemplate}</span>}
        </span>{surface.unpublished > 0 && <Badge>{surface.unpublished}</Badge>}
      </span>
    </SelectItem>)}</SelectContent>
  </Select>;
}
