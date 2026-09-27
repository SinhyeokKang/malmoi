import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor } from "@/lib/adapters";
import { adapterErrorKind } from "@/lib/adapters/types";
import { createGitClient } from "@/lib/github";
import { loadActors } from "@/lib/keys/query";
import { pendingWhere } from "@/lib/protection/where";
import { actorLabel } from "@/lib/keys/view";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { parseGithubPrUrl } from "@/lib/projects/pr-url";
import { formatFromProject, resolveLocalePaths } from "@/lib/pull/plan";
import { keySlot } from "@/lib/pull/undeliverable";
import { loadPullState } from "@/lib/pull/load";
import { renderProject } from "@/lib/pull/run";
import { buildPublishDiff, PREVIEW_LIMIT, type BaseValues, type PublishCell } from "./diff";
import { PreviewBaseFileMissing, PreviewBaseFileUnreadable, type PublishPreview } from "./preview";

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
    createGitClient(project.repoOwner, project.repoName, project.installationId, project.repositoryId).then(cachedBlobs),
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
  /** 보류된 셀이 하나라도 있는 키 — 실린 셀이 하나도 없으면 "보낼 수 있는 키"에서 빠진다(#84). */
  const heldKeys = new Set<string>();
  for (const surface of project.surfaces) {
    const surfaceRows = rows.filter(r => r.surfaceId === surface.id);
    if (!surfaceRows.length) continue;
    const format = formatFromProject(surface, surface.locales.map(l => l.code));
    const adapter = adapterFor(format);
    const paths = resolveLocalePaths(format, adapter.layout, tree.map(t => t.path));
    // ⚠️ **재생성 per-locale은 base 파일을 늘 읽는다** (B3 r3) — 실행이 base 원본으로 base 키 집합을 정하고(B3.4) 못 읽으면 비-base 편집만 있어도 거부한다.
    const regeneratePerLocale = adapter.layout === "per-locale" && adapter.writeStrategy === "regenerate";
    const isBasePath = (p: (typeof paths)[number]) => regeneratePerLocale && p.locale === surface.baseLocale;
    const needed = paths.filter(p => adapter.layout === "multi-locale" || isBasePath(p) || surfaceRows.some(r => r.localeCode === p.locale));
    for (let offset = 0; offset < needed.length; offset += 8) {
      await Promise.all(needed.slice(offset, offset + 8).map(async p => {
        const sha = shas.get(p.path);
        if (!sha) return;
        const content = await client.getBlobText(sha);
        const read = adapter.read(format, [{ path: p.path, content }]);
        // 실행과 같은 판정이다(`render.ts` `baseOwnedByOriginal`) — read가 base 로케일을 못 내면 키 집합을 모른다.
        if (isBasePath(p) && !read.locales.some(l => l.locale === surface.baseLocale)) throw new PreviewBaseFileUnreadable(p.path, project.baseBranch);
        // base 행이 없어 판정만을 위해 읽은 파일은 아래 읽기 오류로 막지 않는다 — 실행은 base의 비문자열 값이 있어도 그 편집들을 싣는다.
        const onlyForKeySet = isBasePath(p) && !surfaceRows.some(r => r.localeCode === p.locale);
        // ⚠️ **편집과 무관한 비관리 항목은 막지 않는다** — 수술적 writer가 파일에 그대로 두는 값(코드의 식·참조·shorthand, YAML 숫자·불리언 —
        // `adapterErrorKind === "unmanaged"`)이고, 실행은 wanted 키의 그런 자리만 경고한다(delivery-invariants D4 · audit #8). 전부 막으면
        // `{ hello: "hi", b: someFn }`·`precision: 3` 파일의 Publish가 화면에서 영영 열리지 않는다. 편집 대상 키가 그 자리이거나 그 밖의 읽기 오류는 막는다.
        const edited = new Set(surfaceRows.map(r => r.stringKey.key));
        // 경고(`duplicate-property`)도 막지 않는다 — 실행이 마지막 값을 싣고 그 자리를 고친다(B7a r1). `read.locales`가 이미 그 값이다.
        const preserved = (e: (typeof read.errors)[number]) => adapterErrorKind(e.code) === "unmanaged" && !(e.key !== undefined && edited.has(e.key));
        if (!onlyForKeySet && read.errors.some(e => adapterErrorKind(e.code) !== "warning" && !preserved(e))) throw new Error("Preview cannot read all values");
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
      if (basePath !== undefined && !shas.has(basePath.path)) throw new PreviewBaseFileMissing(basePath.path, project.baseBranch);
    }
    for (const row of surfaceRows) {
      if (!surface.locales.some(locale => locale.code === row.localeCode)) throw new Error("Preview path unavailable");
      // 수술적 치환은 원본이 없으면 그 파일을 안 낸다(`render.ts`) — 나가지 않을 셀을 약속하지 않는다. 실행은 그 셀을 보류한다.
      if (surgicalPerLocale) {
        const target = paths.find(p => p.locale === row.localeCode);
        if (target !== undefined && !shas.has(target.path)) { withoutFile++; heldKeys.add(row.keyId); continue; }
      }
      // per-locale base 셀: 원본 base 파일에 키 자리가 없으면(코드가 지웠다) 실행은 그 셀을 보류한다 — base 키 집합은 원본이 정한다(B3.4). 같은 `keySlot`이다.
      if (adapter.layout === "per-locale" && row.localeCode === surface.baseLocale) {
        const basePath = paths.find(p => p.locale === surface.baseLocale)?.path;
        const file = basePath === undefined ? undefined : base[basePath];
        if (basePath !== undefined && file !== undefined && keySlot({ [basePath]: file }, row.localeCode, row.stringKey.key).kind === "absent") {
          withoutKey++; heldKeys.add(row.keyId); continue;
        }
      }
      const matches = paths.filter(p => adapter.layout === "per-locale" ? p.locale === row.localeCode :
        Object.hasOwn(base[p.path] ?? {}, row.localeCode) && Object.hasOwn(base[p.path]![row.localeCode]!, row.stringKey.key));
      // ts-dict: 그 로케일 객체는 있는데 어느 파일에도 키 자리가 없으면 실행은 그 셀만 보류한다 — **같은 `keySlot` 판정이다**(audit #1 B).
      // 같은 파일의 다른 로케일이 키를 가질 때(`write-slot-missing`)만 세면 키가 모든 로케일에서 사라진 셀은 화면이 막고 실행은 전달로 셌다.
      if (adapter.layout === "multi-locale" && adapter.writeStrategy === "surgical" && matches.length === 0
        && keySlot(base, row.localeCode, row.stringKey.key).kind === "absent") { withoutKey++; heldKeys.add(row.keyId); continue; }
      // 대상을 확정하지 못했는데 첫 파일을 고르면 무엇을 덮는지 거짓으로 안내한다.
      const path = matches.length === 1 ? matches[0]?.path : undefined;
      if (!path) throw new Error("Preview path unavailable");
      cells.push({ surface: surface.slug, path, keyId: row.keyId, key: row.stringKey.key, localeCode: row.localeCode,
        after: row.value, author: actorLabel(row.updatedBy, actors) ?? "", updatedAt: row.updatedAt.toISOString() });
    }
  }
  // ⚠️ **바뀌는 파일은 실행과 같은 렌더·blob 비교에서 온다** (#128) — 편집 셀의 파일만 세면 토큰 없이 바뀌는 파일(orphan 줄 제거, 닫힌 PR에 실렸던 값의
  // 재전송)이 빠지고 결과에서야 "N files changed"가 나온다. blob은 위에서 읽은 것을 다시 쓴다(`cachedBlobs`).
  const { changes } = await renderProject(project, (await loadPullState(prisma, slug)).surfaces, client);
  // `truncated`는 상한 때문에 **조회하지 않은** 행만이다 — 뺀 셀은 `withoutFile`·`withoutKey`가 따로 말한다.
  return { ...buildPublishDiff(cells, base), total, keys: keyIds.length, truncated: Math.max(0, total - rows.length), withoutFile, withoutKey,
    // ⚠️ **화면이 말하는 수는 나가는 수다** (#84 — POSTMORTEM 2026-09-17). 결과의 `delivered`·Logs와 같은 모집단이어야 한다. 상한(200행) 밖 행은
    // 판정하지 않았으므로 나가는 쪽으로 센다 — `truncated`와 같이 읽힌다.
    changedFiles: changes.map(c => c.path),
    sendable: { total: total - withoutFile - withoutKey, keys: keyIds.length - [...heldKeys].filter(id => !cells.some(c => c.keyId === id)).length },
    openPr: parseGithubPrUrl(rawPr, project) };
}

/** 같은 blob을 두 번 받지 않는다 — 미리보기 조회와 실행 렌더(`renderProject`)가 같은 트리의 같은 파일을 읽는다. */
function cachedBlobs<C extends { getBlobText(sha: string): Promise<string> }>(client: C): C {
  const seen = new Map<string, Promise<string>>();
  return { ...client, getBlobText: (sha: string) => {
    const hit = seen.get(sha);
    if (hit !== undefined) return hit;
    const next = client.getBlobText(sha);
    seen.set(sha, next);
    return next;
  } };
}
