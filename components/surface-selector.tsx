"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { surfaceLabel } from "@/lib/surfaces/plan";

export type SurfaceOption = { slug: string; pathTemplate: string | null; unpublished: number };
export function SurfaceSelector({ value, surfaces, pending, onChange }: {
  value: string; surfaces: readonly SurfaceOption[]; pending: boolean; onChange: (slug: string) => void;
}) {
  if (surfaces.length < 2) return null;
  return <Select value={value} disabled={pending} onValueChange={onChange}>
    <SelectTrigger className="w-48" aria-label={m.surfaces.label} title={surfaces.find(s => s.slug === value)?.pathTemplate ?? undefined}>
      <SelectValue>{(() => { const current = surfaces.find(s => s.slug === value); return current?.pathTemplate ? surfaceLabel(current.pathTemplate) : value; })()}</SelectValue>
    </SelectTrigger>
    <SelectContent>{surfaces.map(surface => <SelectItem key={surface.slug} value={surface.slug}>
      <span title={surface.pathTemplate ?? undefined} className="flex items-center gap-2">
        <span className="flex flex-col items-start">
          <span>{surface.pathTemplate === null ? surface.slug : surfaceLabel(surface.pathTemplate)}</span>
          {surface.pathTemplate !== null && <span className="text-mono text-muted-foreground">{surface.pathTemplate}</span>}
        </span>{surface.unpublished > 0 && <Badge>{surface.unpublished}</Badge>}
      </span>
    </SelectItem>)}</SelectContent>
  </Select>;
}
