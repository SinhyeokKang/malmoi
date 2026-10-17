import type { PullOutcome } from "@/lib/pull/message";
import type { Messages } from "@/lib/i18n";
import { reachedRepository } from "@/lib/locales/reached";
export type PublishView = "created" | "updated" | "partial" | "no-changes" | "config-error" | "transient-error" | "already-running" | "too-soon" | "publish-unsettled";
export function planPublishView(outcome: PullOutcome): PublishView {
  switch (outcome.status) {
    case "committed": return outcome.pr;
    // writer 경고는 **보내지 않은** 결과다(sync-edit-protection T10) — `partial` 갈래가 "보내지 않았다"로 선다. 새 갈래를 늘리지 않는다.
    // 보류만 있고 실린 편집이 0이면 "No changes"(파일이 같았다)가 거짓이다 — 같은 Not sent 틀을 쓴다(delivery-invariants D7).
    // no-changes라도 보류가 있으면 같은 틀이다 — Logs가 SKIPPED + withheld > 0을 Not sent로 읽는다(#83). "이미 리포에 있었다"가 거짓이 된다.
    // 리포에 닿지 못한 채 PR/MR이 닫힌 언어 요청을 정리하고 끝났으면 그 언어의 편집은 나가지 않았다 — "파일이 같았다"가 거짓이다(#267 fix1 Y1).
    case "skipped": return outcome.reason === "writer-warnings" || outcome.reason === "withheld" || (outcome.reason === "no-changes" && outcome.withheld !== undefined)
      || (outcome.reason === "no-edits" && (outcome.expired ?? []).some(request => !reachedRepository(request))) ? "partial" : "no-changes";
    case "failed":
      if (outcome.error === "publish-unsettled" || outcome.error === "already-running" || outcome.error === "too-soon") return outcome.error;
      return outcome.retryable ? "transient-error" : "config-error";
    default: { const exhaustive: never = outcome; return exhaustive; }
  }
}
/**
 * @param pausedReason 꺼진 원인을 호출부가 알 때의 사유 — 번역 화면의 연결 끊김(malmoi#160). 없으면 원인 없는 `paused`다.
 * @param languageWork 언어 변경 작업 수(`countLocaleWork` — 미리보기가 거둘·보낼 파일과 같은 상태). 셀 편집이 0이어도 이게 있으면 Publish가 할 일이 있다
 *   (locale-add 시안 P1 ①④⑤) — 배지는 셀 수 그대로라 서지 않고, 켜진 이유를 `hint`가 sr로 말한다.
 */
export function planPublishButton(m: Messages, { count, languageWork = 0, paused, otherPending, publishPending, pausedReason }: { count: number; languageWork?: number; paused: boolean; otherPending: boolean; publishPending: boolean; pausedReason?: string }) {
  const nothing = count === 0 && languageWork === 0;
  return { mode: publishPending ? "progress" as const : "preview" as const,
    disabled: !publishPending && (nothing || paused || otherPending),
    badge: !publishPending && count > 0 ? count : null,
    hint: nothing ? m.translations.publish.nothing : paused || otherPending ? pausedReason ?? m.translations.publish.paused
      : count === 0 && !publishPending ? m.translations.publish.language.ready : "" };
}

/**
 * 이번 PR에 못 실은 편집의 줄 (delivery-invariants D7). 사유별 한 줄 — 파일이 없다 / 키 자리가 없다 — 에 역할별 다음 행동을 붙인다.
 * ⚠️ 화면에 있는 컨트롤만 가리킨다(POSTMORTEM 2026-09-14) — `Revert to last sent`는 OWNER에게만 선다.
 */
export function planWithheldLines(m: Messages, outcome: PullOutcome, role: "OWNER" | "EDITOR"): string[] {
  const withheld = outcome.status === "committed" || (outcome.status === "skipped" && (outcome.reason === "no-changes" || outcome.reason === "withheld"))
    ? outcome.withheld : undefined;
  if (withheld === undefined) return [];
  const w = m.translations.publish.withheld;
  const lines: string[] = [];
  // ⚠️ **Revert는 보류 셀 전부에 기준이 있을 때만 가리킨다** (#129) — 없으면 그 키의 Revert가 꺼져 있다. 그때는 파일·키 복구와 폐기 승인 Sync뿐이다.
  const revert = withheld.revertable === true;
  if (withheld.file > 0) lines.push(`${w.file(withheld.file)} ${role === "OWNER" ? (revert ? w.owner.file : w.owner.fileNoRevert) : w.editor}`);
  if (withheld.key > 0) lines.push(`${w.key(withheld.key)} ${role === "OWNER" ? (revert ? w.owner.key : w.owner.keyNoRevert) : w.editor}`);
  return lines;
}
