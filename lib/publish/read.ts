import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor } from "@/lib/adapters";
import { createGitClient } from "@/lib/github";
import { loadActors } from "@/lib/keys/query";
import { pendingWhere } from "@/lib/protection/where";
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
  // 무엇이 PR로 나가는가를 정하는 사본이다 — 배너·1층·목록과 같은 토큰 술어여야 "보낼 편집 N건"이 서로 맞는다 (sync-edit-protection T8).
  const where = pendingWhere(projectId);
  const [rows, total, keyIds, client, rawPr] = await Promise.all([
    prisma.translation.findMany({ where, take: PREVIEW_LIMIT, orderBy: [{ surfaceId: "asc" }, { keyId: "asc" }, { localeCode: "asc" }], include: { stringKey: { select: { key: true } } } }),
    prisma.translation.count({ where }),
    // 바닥 요약의 "키 수"는 **미발송 전체**를 세야 한다 — 표에 실린 200행만 세면 상한 아래에서만 참이다.
    prisma.translation.groupBy({ by: ["keyId"], where }),
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
  let withoutFile = 0;
  let withoutKey = 0;
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
        // ⚠️ **편집과 무관한 비리터럴은 막지 않는다** — 실행(ts-dict write)이 wanted 키의 비리터럴만 경고하는 것과 같은 판정이다(delivery-invariants
        // D4). 전부 막으면 `{ hello: "hi", b: someFn }` 파일의 Publish가 화면에서 영영 열리지 않는다. 그 밖의 읽기 오류는 여전히 막는다.
        const edited = new Set(surfaceRows.map(r => r.stringKey.key));
        if (read.errors.some(e => !(e.code === "value-not-string-literal" && e.key !== undefined && !edited.has(e.key)))) throw new Error("Preview cannot read all values");
        const file: BaseValues[string] = Object.create(null);
        for (const locale of read.locales) {
          const entries: Record<string, string> = Object.create(null);
          for (const entry of locale.entries) entries[entry.key] = entry.message;
          file[locale.locale] = entries;
        }
        base[p.path] = file;
      }));
    }
    const surgicalPerLocale = adapter.layout === "per-locale" && adapter.writeStrategy === "surgical";
    // ⚠️ **실행과 같은 판정이다** (delivery-invariants D3 — `lib/pull/undeliverable.ts`). base 파일 부재는 실행이 `writer-warnings`로
    // 거부하므로 어느 셀도 약속하지 않는다 — 편집이 비-base에만 있어도 렌더는 base 파일부터 못 낸다.
    if (surgicalPerLocale) {
      const basePath = paths.find(p => p.locale === surface.baseLocale);
      if (basePath !== undefined && !shas.has(basePath.path)) throw new Error("Preview base file missing");
    }
    for (const row of surfaceRows) {
      if (!surface.locales.some(locale => locale.code === row.localeCode)) throw new Error("Preview path unavailable");
      // 수술적 치환은 원본이 없으면 그 파일을 안 낸다(`render.ts`) — 나가지 않을 셀을 약속하지 않는다. 실행은 그 셀을 보류한다.
      if (surgicalPerLocale) {
        const target = paths.find(p => p.locale === row.localeCode);
        if (target !== undefined && !shas.has(target.path)) { withoutFile++; continue; }
      }
      const matches = paths.filter(p => adapter.layout === "per-locale" ? p.locale === row.localeCode :
        Object.hasOwn(base[p.path] ?? {}, row.localeCode) && Object.hasOwn(base[p.path]![row.localeCode]!, row.stringKey.key));
      // ts-dict: 그 로케일 객체에 자리가 없고 같은 파일의 다른 로케일이 그 키를 가지면 실행은 `write-slot-missing`으로 그 셀만 보류한다.
      if (adapter.layout === "multi-locale" && adapter.writeStrategy === "surgical" && matches.length === 0) {
        const owners = paths.filter(p => {
          const file = base[p.path];
          return file !== undefined && Object.hasOwn(file, row.localeCode)
            && Object.keys(file).some(locale => locale !== row.localeCode && Object.hasOwn(file[locale]!, row.stringKey.key));
        });
        if (owners.length > 0) { withoutKey++; continue; }
      }
      // 대상을 확정하지 못했는데 첫 파일을 고르면 무엇을 덮는지 거짓으로 안내한다.
      const path = matches.length === 1 ? matches[0]?.path : undefined;
      if (!path) throw new Error("Preview path unavailable");
      cells.push({ surface: surface.slug, path, keyId: row.keyId, key: row.stringKey.key, localeCode: row.localeCode,
        after: row.value, author: actorLabel(row.updatedBy, actors) ?? "", updatedAt: row.updatedAt.toISOString() });
    }
  }
  // `truncated`는 상한 때문에 **조회하지 않은** 행만이다 — 뺀 셀은 `withoutFile`·`withoutKey`가 따로 말한다.
  return { ...buildPublishDiff(cells, base), total, keys: keyIds.length, truncated: Math.max(0, total - rows.length), withoutFile, withoutKey, openPr: parseGithubPrUrl(rawPr, project) };
}
