import "server-only";
import { z } from "zod";

import { m } from "@/lib/i18n";
import { revalidateTranslationReaders } from "@/lib/keys/revalidate-readers";
import type { RevertBlockReason } from "@/lib/keys/revert";
import { RevertExecuteInput, runRevert } from "@/lib/keys/revert-translation";
import { KeySaveInput } from "@/lib/keys/save";
import { saveTranslationBatch } from "@/lib/keys/save-translation";

import { planBatchSave } from "../batch";
import type { ToolOutcome } from "../result";
import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **번역 쓰기 둘** (design §2.2). 저장은 화면 Save와 같은 판정을 키마다 돌리되 **한 잠금·한 tx**다 — 일부 키의 거부가 정상 결과이고
 * 그 키만 건너뛴다. 사건은 키마다 하나로 화면과 같다. Revert는 미리보기의 확인값을 받을 때만 쓰고 잠금 뒤 다시 잰다.
 * ⚠️ **적재 lease 중이면 둘 다 `sync-running`이다** (sync-lock C4·R2) — 저장은 호출 **전체**를 한 번 거부하고(키별 결과 없음), 다시 열리는 시각을
 * `detail`로 싣는다. 에이전트가 그 시각 뒤에 같은 호출을 다시 하면 된다.
 */

/** 거부 `detail` — 시각은 ISO 문자열이다(`structuredContent`는 JSON이다). */
const syncRunning = (lock: { startedAt: Date; reopensBy: Date }): ToolOutcome =>
  ({ status: "refused", code: "sync-running", detail: { startedAt: lock.startedAt.toISOString(), reopensBy: lock.reopensBy.toISOString() } });

/** 키 하나의 입력 — 화면 Save의 스키마(`KeySaveInput`)의 `keyId`·`changes`를 그대로 쓴다(복제하면 한쪽 상한만 좁아진다). */
const Entry = KeySaveInput.pick({ keyId: true, changes: true });

export const setTranslations = defineTool({
  name: "set_translations",
  inputSchema: KeySaveInput.pick({ slug: true, surfaceSlug: true }).extend({ entries: z.array(Entry) }),
  async run({ prisma, subject }, { slug, surfaceSlug, entries }) {
    const batch = planBatchSave(entries);
    if (batch.status === "empty") return { status: "invalid-input" };
    if (batch.status === "too-many") return { status: "too-many" };
    if (batch.status === "duplicate-key") return { status: "refused", code: "duplicate-key", detail: { keyId: batch.keyId } };
    const gate = await checkProjectTool(prisma, subject, { name: "set_translations", slug });
    if (gate.status !== "ok") return gate;
    const result = await saveTranslationBatch(prisma, coreSubject(subject), { slug, surfaceSlug, entries: batch.entries });
    if (!result.ok) return result.error === "sync-running" ? syncRunning(result) : { status: "refused", code: result.error };
    const saved = result.results.filter(r => r.result.ok);
    // 아무 셀도 안 바뀌었으면(전부 no-op·거부) 다시 그릴 이유가 없다 — 화면 Save와 같은 판정이다.
    if (saved.some(r => r.result.ok && r.result.cells.length > 0)) revalidateTranslationReaders(slug);
    return ok({
      results: result.results.map(({ keyId, result: r }) => r.ok
        ? { keyId, status: "saved", cells: r.cells }
        : { keyId, status: "rejected", error: r.error, message: keyRejection(r), ...("localeCodes" in r ? { localeCodes: r.localeCodes } : {}) }),
    }, m.mcp.summary.saved(saved.length, result.results.length - saved.length));
  },
});

/** 키 하나의 거부 → 번역 화면 저장 바닥의 같은 문장(`components/translations/workspace/workspace.tsx`의 `ALERTS`). */
function keyRejection(r: { error: string; localeCodes?: string[] }): string {
  const footer = m.translations.workspace.footer;
  if (r.error === "cannot-clear") return `${footer.cannotClear.title((r.localeCodes ?? []).join(", "))} ${footer.cannotClear.body}`;
  if (r.error === "key-unavailable") return footer.keyGone;
  return footer.saveFailed.body;
}

const REVERT_BLOCKED = {
  forbidden: m.translations.workspace.revert.forbidden,
  busy: m.translations.workspace.revert.busy,
  // 서버 경로에서는 안 난다(`draftDirty: false`) — 갈래가 union에 있어 `satisfies`가 요구한다. 화면의 같은 갈래 문장이다.
  unsaved: m.translations.workspace.revert.unsaved,
  "baseline-unknown": m.translations.workspace.revert.unavailable,
  "baseline-stale": m.translations.workspace.revert.unavailable,
  unsettled: m.translations.workspace.revert.unavailable,
  nothing: m.translations.workspace.revert.failed.body,
  "key-unavailable": m.errors.access["not-found"],
  "sync-running": m.repositorySync.errors["already-running"],
} satisfies Record<RevertBlockReason, string>;

export const revertToLastSent = defineTool({
  name: "revert_to_last_sent",
  inputSchema: RevertExecuteInput,
  async run({ prisma, subject }, input): Promise<ToolOutcome> {
    const gate = await checkProjectTool(prisma, subject, { name: "revert_to_last_sent", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await runRevert(prisma, coreSubject(subject), input);
    if (result.status === "error") return { status: "refused", code: result.error };
    if (result.status === "reconfirm") return { status: "refused", code: "reconfirm", message: m.translations.workspace.revert.changed.body };
    if (result.status === "blocked") {
      // 문장은 `MESSAGE["sync-running"]`(같은 키)이 고른다 — 여기서는 시각을 실을 뿐이다.
      if (result.reason === "sync-running") return syncRunning(result);
      return { status: "refused", code: result.reason, message: REVERT_BLOCKED[result.reason] };
    }
    revalidateTranslationReaders(input.slug);
    return ok({ cells: result.cells }, m.translations.workspace.revert.reverted);
  },
});
