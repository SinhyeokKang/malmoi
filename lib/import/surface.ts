import "server-only";

import type { RepoReader, RepoSnapshot } from "@/lib/github";
import { adapterFor } from "@/lib/adapters";
import { compareKeys } from "@/lib/adapters/shared";
import type { AdapterName } from "@/lib/adapters/types";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import { ingestTargets } from "@/lib/onboarding/detect";
import { readFiles } from "./read";
import { verifyEmptyCatalog } from "./empty";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { prepareFirstSnapshot, type FirstIngestResult } from "@/lib/onboarding/ingest";
import type { PushPayloadType } from "@/lib/push/plan";

/** GitHub I/O stays outside the caller's database transaction. */
export async function readSurfaceSnapshot(
  reader: RepoReader,
  snapshot: Extract<RepoSnapshot, { status: "ok" }>,
  stored: { adapter: AdapterName; pathTemplate: string; baseLocale: string },
) {
  const result = await readSurfaceFiles(reader, snapshot, stored);
  return result.status === "ok" ? result : { status: result.status, reason: result.reason };
}

async function readSurfaceFiles(
  reader: RepoReader,
  snapshot: Extract<RepoSnapshot, { status: "ok" }>,
  stored: { adapter: AdapterName; pathTemplate: string; baseLocale: string },
) {
  const paths = snapshot.files.map(file => file.path);
  // Targets come from the tree, not successful downloads: otherwise missing locales disappear from failures.
  const attempted = templatePaths(stored.adapter, stored.pathTemplate, paths);
  const files = await readFiles(reader, snapshot, attempted);
  const confirmed = planConfirmedFormat(stored, files);
  if (confirmed.status !== "ok") return { ...confirmed, paths, targets: attempted, blobs: new Map(files.map(file => [file.path, file.content])) };

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

export type StoredSurfaceImport = {
  id: string; slug: string; adapter: AdapterName; pathTemplate: string; baseLocale: string;
  nested: boolean | null; nestedByPath: unknown;
};
export type SurfaceImportInput = {
  projectId: string; projectSlug: string; surface: StoredSurfaceImport;
  snapshot: Extract<RepoSnapshot, { status: "ok" }>;
  mode: "first" | "repository"; token: string; startedAt: Date;
};
export type PreparedSurfaceImport =
  | { kind: "payload"; payload: PushPayloadType; result: FirstIngestResult }
  | { kind: "empty"; result: FirstIngestResult }
  | { kind: "failed"; error: "resource-limit" | "ingest-failed"; result: FirstIngestResult };

export async function prepareSurfaceImport(reader: RepoReader, input: SurfaceImportInput): Promise<PreparedSurfaceImport> {
  try {
    const read = await readSurfaceFiles(reader, input.snapshot, input.surface);
    if (input.mode === "repository" && verifyEmptyCatalog({ stored: input.surface, paths: read.paths, blobs: read.blobs })) {
      return { kind: "empty", result: { count: 0, failed: 0, errors: [] } };
    }
    if (read.status !== "ok") {
      const format = { adapter: input.surface.adapter, pathTemplate: input.surface.pathTemplate, locales: [] };
      const parsed = adapterFor(format).read(format, [...read.blobs].map(([path, content]) => ({ path, content })));
      const errors = [...parsed.errors, ...read.targets.filter(path => !read.blobs.has(path)).map(path => ({ path, code: "download-failed" as const }))];
      return { kind: "failed", error: "ingest-failed", result: { count: 0, failed: Math.max(1, errors.length), errors } };
    }
    const prepared = prepareFirstSnapshot({
      ...input, surfaceId: input.surface.id, surfaceSlug: input.surface.slug,
      format: read.format, baseLocale: read.baseLocale,
      headSha: input.snapshot.headSha, headCommittedAt: input.snapshot.headCommittedAt,
      paths: read.paths, targets: read.targets, blobs: read.blobs,
    });
    return prepared.payload === null
      ? { kind: "failed", error: "ingest-failed", result: prepared.result }
      : { kind: "payload", ...prepared, payload: prepared.payload };
  } catch (error) {
    if (!(error instanceof IngestBudgetError)) throw error;
    return { kind: "failed", error: "resource-limit", result: { count: 0, failed: 1, errors: [] } };
  }
}
