import "server-only";

import type { RepoReader, RepoSnapshot } from "@/lib/github";
import { adapterFor } from "@/lib/adapters";
import { compareKeys } from "@/lib/adapters/shared";
import type { AdapterName } from "@/lib/adapters/types";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import { ingestTargets } from "@/lib/onboarding/detect";
import { readFiles } from "./read";

/** GitHub I/O stays outside the caller's database transaction. */
export async function readSurfaceSnapshot(
  reader: RepoReader,
  snapshot: Extract<RepoSnapshot, { status: "ok" }>,
  stored: { adapter: AdapterName; pathTemplate: string; baseLocale: string },
) {
  const paths = snapshot.files.map(file => file.path);
  // Targets come from the tree, not successful downloads: otherwise missing locales disappear from failures.
  const attempted = templatePaths(stored.adapter, stored.pathTemplate, paths);
  const files = await readFiles(reader, snapshot, attempted);
  const confirmed = planConfirmedFormat(stored, files);
  if (confirmed.status !== "ok") return confirmed;

  const targets = [...new Set([
    ...attempted,
    ...ingestTargets(confirmed.format, adapterFor(confirmed.format).layout, paths),
  ])].sort(compareKeys);
  const blobs = new Map(files.map(file => [file.path, file.content]));
  // Retry only missing blobs once; retain failed attempts in targets for the preparation failure count.
  for (const extra of await readFiles(reader, snapshot, targets.filter(path => !blobs.has(path)))) {
    blobs.set(extra.path, extra.content);
  }
  return { ...confirmed, paths, targets, blobs };
}
