"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { surfaceLabel } from "@/lib/surfaces/plan";

export type SurfaceOption = { slug: string; pathTemplate: string | null; unpublished: number };
export function SurfaceSelector({ value, surfaces, pending, onChange }: {
  value: string; surfaces: readonly SurfaceOption[]; pending: boolean; onChange: (slug: string) => void;
}) {
  if (surfaces.length < 2) return null;
  return <Select value={value} disabled={pending} onValueChange={onChange}>
    <SelectTrigger className="w-48" aria-label={m.surfaces.label}><SelectValue /></SelectTrigger>
    <SelectContent>{surfaces.map(surface => <SelectItem key={surface.slug} value={surface.slug}>
      <span title={surface.pathTemplate ?? undefined} className="flex items-center gap-2">
        {surface.pathTemplate === null ? surface.slug : surfaceLabel(surface.pathTemplate)}{surface.unpublished > 0 && <Badge>{surface.unpublished}</Badge>}
      </span>
    </SelectItem>)}</SelectContent>
  </Select>;
}

export function LocaleSurfaceSelector({ slug, surfaceSlug, surfaces }: {
  slug: string; surfaceSlug: string; surfaces: readonly SurfaceOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <SurfaceSelector value={surfaceSlug} surfaces={surfaces} pending={pending}
    onChange={next => startTransition(() => router.push(routes.surfaceLocales(slug, next)))} />;
}
