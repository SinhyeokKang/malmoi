import { compareSurfaces, surfaceOwnership } from "@/lib/surfaces/plan";
import type { LocalFile } from "./plan";

export function planMultiSurfacePull(plans: readonly {
  surfaceId: string; surfaceSlug: string; files: readonly LocalFile[];
}[]): LocalFile[] {
  const ownership = surfaceOwnership(plans.map(p => ({ ...p, paths: p.files.map(f => f.path) })));
  if (!ownership.ok) throw new Error(ownership.conflicts.map(c => `Surface path conflict: ${c.path} (${c.surfaceSlugs.join(", ")})`).join("; "));
  return plans.flatMap(p => p.files).sort((a, b) => compareSurfaces(a.path, b.path));
}
