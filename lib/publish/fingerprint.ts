import { createHash } from "node:crypto";

import type { PullState } from "@/lib/pull/run";

/**
 * Publish 지문 (mcp-connector design §3.1). `preview_publish`가 내고 `publish`가 실행권 뒤 같은 입력으로 재계산해 대조한다 —
 * 다르면 GitHub 쓰기 없이 `reconfirm`이다. 형은 `discardFingerprint`(`lib/protection/fingerprint.ts`)와 같다: HMAC·만료 없이
 * **상태 digest**이고, 재사용은 상태 변화가 지문을 바꿔 막는다.
 *
 * **입력은 `loadPullState` 전체 + base head다** — 표시 상한(200행)과 무관하므로 상한 밖 편집과 토큰 없는 export 변경(orphan 등)도
 * 잡는다. `maxUpdatedAt`·`unpublished`·`lastPulledAt`은 넣지 않는다: 앞 둘은 셀·토큰에서 파생되고, 뒤는 export 입력이 아니다.
 *
 * ⚠️ **조회 순서가 지문을 바꾸면 안 된다** — 표면·키·로케일·셀·토큰을 전부 정렬해 직렬화한다. 매번 다른 순서면 매번 reconfirm이다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 함수다.
 */
export function publishFingerprint(
  state: PullState,
  baseHead: string,
  /**
   * 언어 변경의 base 입력(locale-add design §2) — 행 경로의 base blob SHA와 이번 계획의 삭제 경로(`localeFingerprintInput`). 대상 파일이 바뀌거나 삭제가
   * 달라지면 승인을 다시 받는다. 행이 없으면 비어 있고, 그때 지문 바이트는 옛것 그대로다.
   */
  locale?: { targets: readonly (readonly [string, string | null])[]; deletes: readonly string[] },
): string {
  const { project } = state;
  // 언어 변경 행·전달 목록은 소스에 붙어 온다(`localeChanges`). 아무 소스에도 없고 base 입력도 비면 꼬리를 붙이지 않는다 — 언어 변경이 없는 프로젝트의 지문이 바뀌지 않는다.
  const localeTail = state.surfaces.some(s => s.localeChanges !== undefined) || (locale !== undefined && (locale.targets.length > 0 || locale.deletes.length > 0))
    ? [[
      [...state.surfaces].sort(byId).map(s => [s.id, s.localeChanges === undefined ? null : [
        [...s.localeChanges.rows].sort((a, b) => compare(a.localeCode, b.localeCode)).map(r => [r.localeCode, r.operation, r.requestedAt.toISOString()]),
        s.localeChanges.delivered === null ? null : s.localeChanges.delivered.map(e => [e.localeCode, e.effect]),
      ]]),
      locale?.targets.map(([path, sha]) => [path, sha]) ?? [],
      [...(locale?.deletes ?? [])].sort(compare),
    ]]
    : [];
  const canonical = JSON.stringify([
    project.id,
    // 호스트·GitLab 연결 참조까지 — 저장하지 않는 지문이라 바이트가 바뀌어도 된다(gitlab-repositories). 다른 OWNER의 재연결 뒤 옛 미리보기가 통하지 않는다.
    [project.repoHost, project.repositoryId ?? null, project.installationId, project.gitlabConnectionId, project.repoOwner, project.repoName, project.baseBranch],
    baseHead,
    [...state.surfaces].sort(byId).map(s => [
      s.id, s.slug, s.adapterName, s.pathTemplate, s.nested, canonicalJson(s.nestedByPath), s.baseLocale,
      [...s.localeCodes].sort(compare),
      [...s.keys].sort((a, b) => compare(a.key, b.key)).map(k => [
        k.id ?? null, k.key, k.sourceText, k.description ?? null, k.sortIndex ?? null, k.orphaned,
        Object.keys(k.cells).sort(compare).flatMap(locale => {
          const cell = k.cells[locale];
          return cell === undefined ? [] : [[locale, cell.value, cell.description ?? null, canonicalJson(cell.placeholders)]];
        }),
      ]),
    ]),
    [...state.pendingEdits].sort(byId).map(p => [p.id, p.token]),
    [...(state.deliveryContexts ?? [])].sort((a, b) => compare(a.surfaceId, b.surfaceId)).map(c => [c.surfaceId, c.fingerprint]),
    ...localeTail,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byId(a: { id: string }, b: { id: string }): number {
  return compare(a.id, b.id);
}

/** Json 컬럼(`nestedByPath`·`placeholders`)을 키 정렬 튜플로 — 삽입 순서가 달라도 같은 값이다. `undefined`는 `null`로 접는다. */
function canonicalJson(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return ["a", value.map(canonicalJson)];
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["o", Object.keys(record).sort(compare).map(k => [k, canonicalJson(record[k])])];
  }
  return value;
}
