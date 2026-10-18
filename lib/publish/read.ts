import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor } from "@/lib/adapters";
import { adapterErrorKind } from "@/lib/adapters/types";
import { createGitClient } from "@/lib/repo-host";
import { repoTargetOf } from "@/lib/repo-host/target";
import { loadActors } from "@/lib/keys/query";
import { actorLabel } from "@/lib/keys/view";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { parseReviewUrl } from "@/lib/projects/pr-url";
import { formatFromProject, resolveLocalePaths } from "@/lib/pull/plan";
import { blockingErrors, keySlot } from "@/lib/pull/undeliverable";
import { loadPreviewSnapshot } from "@/lib/pull/load";
import { planDelivery, planLocales, projectFormats, renderProject } from "@/lib/pull/run";
import { NO_LOCALE_PLAN, afterExpiry, expiringLocalesOf, expiryCheckApplies, hasLocaleRows, localeFingerprintInput, localeNotesOf, localeWorkOf, withdrawnLocalesOf } from "@/lib/pull/locales";
import { publishFingerprint } from "./fingerprint";
import { buildPublishDiff, PREVIEW_LIMIT, type BaseValues, type PublishCell } from "./diff";
import { PreviewBaseFileMissing, PreviewBaseFileUnreadable, PreviewWriterWarnings, type PublishPreview } from "./preview";

/** 이전 값은 표시 전용이다 — export·커밋·PR 판정의 입력으로 넘기지 않는다. */
export async function readPublishPreview(prisma: PrismaClient, projectId: string, slug: string): Promise<PublishPreview> {
  /**
   * ⚠️ **보여 주는 것과 서명하는 것이 한 스냅샷이다** (Codex review CR-01). 표시 행·수·표면 설정·렌더 입력·`fingerprint`가 전부 이 한 벌에서 온다 —
   * 따로 읽으면 GitHub 대기 중의 저장이 "A를 보여 주고 B를 승인하는" 지문을 만든다. 행 술어는 배너·1층·목록과 같은 `pendingWhere`다(sync-edit-protection T8).
   */
  const { state, rows, total, keys, archivedAt } = await loadPreviewSnapshot(prisma, slug, PREVIEW_LIMIT);
  const project = state.project;
  // slug가 가리키는 프로젝트가 인가된 그 프로젝트여야 한다 — 다르면 남의 행을 보여 주게 된다.
  if (project.id !== projectId) throw new Error("Project changed");
  const connection = repoTargetOf(project);
  if (connection.status !== "ok") throw new Error("Repository unavailable");
  const [client, rawPr] = await Promise.all([
    createGitClient(connection.target).then(cachedBlobs),
    loadOpenPrUrl(slug, { ...project, repositoryId: connection.target.repositoryId, archivedAt }),
  ]);
  const head = await client.getRefSha(`heads/${project.baseBranch}`);
  if (head === null) throw new Error("Base unavailable");
  const tree = await client.getTree(head);
  const shas = new Map(tree.map(t => [t.path, t.sha]));
  // 표시 경로를 찾기 전에 실행과 같은 거부를 판정한다. 키 가림·파일 종류 오류를 조회 장애로 오인하지 않게 한다(#200).
  // 같은 스냅샷·head·트리와 blob 캐시를 재사용하므로 중복 다운로드 없이 같은 지문 입력을 쓴다.
  // 언어 변경 계획도 실행과 같은 함수·같은 트리다 — 삭제·새 파일·보류가 미리보기와 실행에서 갈리지 않는다(locale-add design §2 "같은 deletes").
  /**
   * ⚠️ **실행이 스냅샷 전에 정리할 요청을 먼저 판정한다** (#267) — PR/MR이 더 이상 열려 있지 않은 언어 요청은 실행이 만료하므로 그 삭제·새 파일을 약속하지 않는다.
   * 읽기만이다: 같은 판정(`expiryCheckApplies` → `planLocaleExpiry`)을 같은 스냅샷·트리에 대 보고, 계획은 만료 뒤 상태로 세운다(`afterExpiry` — 존재까지).
   * 열린 PR 조회는 표시용과 같은 결과다 — 모름(`undefined`)은 `failed`라 정리한다고 말하지 않는다(실행도 그때 실패한다).
   */
  const pullRequest = rawPr === undefined ? "failed" as const : rawPr === null ? "none-open" as const : "open" as const;
  const expiring = expiryCheckApplies(state.unpublished, state.surfaces) ? expiringLocalesOf(projectFormats(state.surfaces), pullRequest, tree) : [];
  const surfaces = afterExpiry(state.surfaces, expiring);
  // 만료 뒤 비활성이 되는 언어의 미발송 편집은 나가지 않고 미발송에서도 빠진다(`pendingWhere`가 비활성 언어를 뺀다) — 보낼 수·미발송 수로 세지 않는다(fix1 R2).
  const surfaceIdOf = new Map(state.surfaces.map(surface => [surface.slug, surface.id]));
  const deactivated = new Set(expiring.filter(item => item.presence === "orphan").map(item => `${surfaceIdOf.get(item.surfaceSlug) ?? ""}\0${item.localeCode}`));
  const isDeactivated = (cell: { surfaceId: string; localeCode: string }) => deactivated.has(`${cell.surfaceId}\0${cell.localeCode}`);
  const droppedEdits = state.pendingEdits.flatMap(edit => edit.cell !== undefined && isDeactivated(edit.cell) ? [edit.cell] : []);
  const keptKeys = new Set(state.pendingEdits.flatMap(edit => edit.cell !== undefined && !isDeactivated(edit.cell) ? [edit.cell.keyId] : []));
  const sendTotal = total - droppedEdits.length;
  const sendKeys = keys - new Set(droppedEdits.map(cell => cell.keyId).filter(id => !keptKeys.has(id))).size;
  // 만료 뒤 보낼 것이 없으면 실행은 1층에서 `no-edits`로 끝난다 — 렌더가 base와 달라도(되살아난 언어 등) 파일을 약속하지 않는다.
  const idle = expiring.length > 0 && state.unpublished - droppedEdits.length === 0 && localeWorkOf(surfaces) === 0;
  const formats = projectFormats(surfaces);
  const localePlan = hasLocaleRows(surfaces) ? planLocales(project, formats, tree) : NO_LOCALE_PLAN;
  const { changes, rendered, resolved, current } = await renderProject(project, formats, client, { baseHead: head, tree }, localePlan);
  for (const surface of rendered) {
    for (const file of surface.files) for (const error of file.errors ?? []) {
      if (error.locale !== surface.baseLocale) continue;
      if (error.code === "original-file-missing") throw new PreviewBaseFileMissing(error.path, project.baseBranch);
      if (error.code === "write-parse-failed" && file.locale === surface.baseLocale) throw new PreviewBaseFileUnreadable(error.path, project.baseBranch);
    }
  }
  const { warnings } = planDelivery(state.pendingEdits, { resolved, current, rendered, locales: localePlan });
  /** 렌더에서 뺀 언어(REMOVE · 경로가 이미 있는 ADD · 값 0개 ADD) — 그 셀은 실행이 보류하므로 표에 약속하지 않는다. */
  const excluded = new Set(localePlan.surfaces.flatMap(plan => plan.exclude.map(code => `${plan.surfaceId}\0${code}`)));
  const creates = new Set(localePlan.surfaces.flatMap(plan => plan.creates.map(item => `${plan.surfaceId}\0${item.localeCode}`)));
  warnings.push(...blockingErrors(rendered).map(({ surfaceSlug, error: { path, code, key, detail } }) => (
    { surfaceSlug, path, code, ...(key === undefined ? {} : { key }), ...(detail === undefined ? {} : { detail }) }
  )));
  if (warnings.length > 0) throw new PreviewWriterWarnings(warnings);
  const actors = await loadActors(prisma, [...new Set(rows.flatMap(r => r.updatedBy ? [r.updatedBy] : []))]);
  const base: BaseValues = Object.create(null);
  const cells: PublishCell[] = [];
  let withoutFile = 0;
  /** `withoutFile` 중 언어 변경 계획이 뺀 언어의 셀 — 실행의 `withheld.language`와 같은 판정이다(R-E3 Y1). */
  let withoutFileLanguage = 0;
  let withoutKey = 0;
  /** 보류된 셀이 하나라도 있는 키 — 실린 셀이 하나도 없으면 "보낼 수 있는 키"에서 빠진다(#84). */
  const heldKeys = new Set<string>();
  const shownRows = deactivated.size === 0 ? rows : rows.filter(r => !isDeactivated(r));
  for (const surface of surfaces) {
    const surfaceRows = shownRows.filter(r => r.surfaceId === surface.id);
    if (!surfaceRows.length) continue;
    const format = formatFromProject(surface, surface.localeCodes);
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
        const errors = onlyForKeySet ? [] : read.errors.filter(e => adapterErrorKind(e.code) !== "warning" && !preserved(e));
        // 실행이 쓸 수 있는 키여도 같은 파일의 불확실한 read는 보수적으로 막는다. 장애 재시도가 아닌 파일 수정 경고다.
        if (errors.length > 0) throw new PreviewWriterWarnings(errors.map(error => ({ ...error, surfaceSlug: surface.slug })));
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
      if (!surface.localeCodes.includes(row.localeCode)) throw new Error("Preview path unavailable");
      // 실행의 `planDelivery`와 같은 판정이다 — 언어 통째 보류는 파일 보류로 센다(결과의 `withheld.file`).
      if (excluded.has(`${surface.id}\0${row.localeCode}`)) { withoutFile++; withoutFileLanguage++; heldKeys.add(row.keyId); continue; }
      // 수술적 치환의 원본 부재는 보류하되, ADD 계획의 생성·복구는 실행이 새 파일을 내므로 포함한다.
      if (surgicalPerLocale && !creates.has(`${surface.id}\0${row.localeCode}`)) {
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
  // `truncated`는 상한 때문에 **조회하지 않은** 행만이다 — 뺀 셀은 `withoutFile`·`withoutKey`가 따로 말한다.
  const sent = idle ? [] : changes;
  return { ...buildPublishDiff(cells, base), total: sendTotal, keys: sendKeys, truncated: Math.max(0, sendTotal - shownRows.length), withoutFile, withoutFileLanguage, withoutKey,
    // ⚠️ **화면이 말하는 수는 나가는 수다** (#84 — POSTMORTEM 2026-09-17). 결과의 `delivered`·Logs와 같은 모집단이어야 한다. 상한(200행) 밖 행은
    // 판정하지 않았으므로 나가는 쪽으로 센다 — `truncated`와 같이 읽힌다.
    changedFiles: sent.map(c => c.path),
    // 실행 결과의 `files`와 같은 판정이다 — delete는 base에 있을 때만 생기고, upsert는 base에 있으면 갱신이다.
    fileChanges: sent.map(c => ({ path: c.path, kind: c.kind === "delete" ? "removed" as const : shas.has(c.path) ? "updated" as const : "new" as const })),
    ...((notes) => (notes === undefined ? {} : { locales: notes }))(localeNotesOf(localePlan)),
    // 행이 없어도(전달 뒤 취소) 전달 목록만으로 생긴다 — 계획과 같은 스냅샷의 목록이라 실행의 수렴 판정(`deliverableLocaleWork`)과 같은 입력이다.
    ...((withdrawn) => (withdrawn.length === 0 ? {} : { withdrawnLocales: withdrawn }))(withdrawnLocalesOf(localePlan, surfaces)),
    ...(expiring.length === 0 ? {} : { expiringLocales: expiring }),
    sendable: { total: sendTotal - withoutFile - withoutKey, keys: sendKeys - [...heldKeys].filter(id => !cells.some(c => c.keyId === id)).length },
    openPr: parseReviewUrl(rawPr, project),
    // ⚠️ **셀 표시가 아니라 렌더가 쓴 스냅샷 전체 + 읽은 head다** (mcp-connector design §3.1) — 200행 상한 밖 편집·토큰 없는 export 변경도 바꾼다.
    /**
     * 지문은 만료 **전** 스냅샷(`state`)과 화면이 보여 준 계획(만료 뒤)의 언어 입력이다. 정리할 요청이 있으면 실행은 만료 뒤 다시 읽은 상태로 재므로 행·대상 경로가
     * 갈려 늘 다시 확인이다 — 미리보기 뒤 PR/MR이 다시 열려 만료가 없어도 계획(대상·삭제)이 갈린다. 따로 꼬리를 싣지 않는다(review-F2 W1: 꼬리를 빼도 같았다).
     */
    fingerprint: publishFingerprint(state, head, hasLocaleRows(surfaces) ? localeFingerprintInput(localePlan, formats, tree) : undefined) };
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
