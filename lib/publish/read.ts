import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor } from "@/lib/adapters";
import { createGitClient } from "@/lib/github";
import { loadActors } from "@/lib/keys/query";
import { actorLabel } from "@/lib/keys/view";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { parseGithubPrUrl } from "@/lib/projects/pr-url";
import { formatFromProject, resolveLocalePaths } from "@/lib/pull/plan";
import { buildPublishDiff, PREVIEW_LIMIT, type BaseValues, type PublishCell } from "./diff";
import type { PublishPreview } from "./preview";

/** 이전 값은 표시 전용이다 — export·커밋·PR 판정의 입력으로 넘기지 않는다. */
export async function readPublishPreview(prisma: PrismaClient, projectId: string, slug: string): Promise<PublishPreview> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: {
    surfaces: { where: { archivedAt: null }, include: { locales: { where: { orphaned: false }, select: { code: true } } } },
  } });
  if (!project.installationId || !project.repositoryId) throw new Error("Repository unavailable");
  const where = { projectId, surface: { archivedAt: null }, updatedBy: { not: null },
    ...(project.lastPulledAt === null ? {} : { updatedAt: { gt: project.lastPulledAt } }) };
  const [rows, total, client, rawPr] = await Promise.all([
    prisma.translation.findMany({ where, take: PREVIEW_LIMIT, orderBy: [{ surfaceId: "asc" }, { keyId: "asc" }, { localeCode: "asc" }], include: { stringKey: { select: { key: true } } } }),
    prisma.translation.count({ where }),
    createGitClient(project.repoOwner, project.repoName, project.installationId, project.repositoryId),
    loadOpenPrUrl(slug, project),
  ]);
  const head = await client.getRefSha(`heads/${project.baseBranch}`);
  if (head === null) throw new Error("Base unavailable");
  const tree = await client.getTree(head);
  const shas = new Map(tree.map(t => [t.path, t.sha]));
  const actors = await loadActors(prisma, [...new Set(rows.flatMap(r => r.updatedBy ? [r.updatedBy] : []))]);
  const base: BaseValues = Object.create(null);
  const cells: PublishCell[] = [];
  for (const surface of project.surfaces) {
    const surfaceRows = rows.filter(r => r.surfaceId === surface.id);
    if (!surfaceRows.length) continue;
    const format = formatFromProject(surface, surface.locales.map(l => l.code));
    const adapter = adapterFor(format);
    const paths = resolveLocalePaths(format, adapter.layout, tree.map(t => t.path));
    const needed = paths.filter(p => adapter.layout === "multi-locale" || surfaceRows.some(r => r.localeCode === p.locale));
    for (let offset = 0; offset < needed.length; offset += 8) {
      await Promise.all(needed.slice(offset, offset + 8).map(async p => {
        const sha = shas.get(p.path);
        if (!sha) return;
        const content = await client.getBlobText(sha);
        const read = adapter.read(format, [{ path: p.path, content }]);
        if (read.errors.length) throw new Error("Preview cannot read all values");
        const file: BaseValues[string] = Object.create(null);
        for (const locale of read.locales) {
          const entries: Record<string, string> = Object.create(null);
          for (const entry of locale.entries) entries[entry.key] = entry.message;
          file[locale.locale] = entries;
        }
        base[p.path] = file;
      }));
    }
    for (const row of surfaceRows) {
      if (!surface.locales.some(locale => locale.code === row.localeCode)) throw new Error("Preview path unavailable");
      const matches = paths.filter(p => adapter.layout === "per-locale" ? p.locale === row.localeCode :
        Object.hasOwn(base[p.path] ?? {}, row.localeCode) && Object.hasOwn(base[p.path]![row.localeCode]!, row.stringKey.key));
      // 대상을 확정하지 못했는데 첫 파일을 고르면 무엇을 덮는지 거짓으로 안내한다.
      const path = matches.length === 1 ? matches[0]?.path : undefined;
      if (!path) throw new Error("Preview path unavailable");
      cells.push({ surface: surface.slug, path, keyId: row.keyId, key: row.stringKey.key, localeCode: row.localeCode,
        after: row.value, author: actorLabel(row.updatedBy, actors) ?? "", updatedAt: row.updatedAt.toISOString() });
    }
  }
  return { ...buildPublishDiff(cells, base), total, truncated: Math.max(0, total - cells.length), openPr: parseGithubPrUrl(rawPr, project) };
}
