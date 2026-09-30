import type { ImportEventSummary } from "@/lib/import/automation";
import type { RepositoryImportError } from "@/lib/import/result";
import type { PullOutcome } from "@/lib/pull/message";
import type { PullItem } from "@/lib/pull/targets";

import type { NightlyPlan } from "./plan";

/**
 * 야간 방문 하나의 결과 — `/api/pull` 응답 항목(`PullItem`)의 본체다. **계약을 타입으로 든다**(POSTMORTEM 2026-08-31 — 외부 계약을
 * 리터럴로 조립했다가 필수 필드가 늘어도 조용했다). `action`이 어느 갈래였는지 말하고, 갈래마다 사건 결과를 싣는다.
 */
export type NightlyVisit =
  | ({ action: "publish" } & PullOutcome)
  | ({ action: "import"; recorded: true } & ImportEventSummary)
  | { action: "import"; recorded: false; error: RepositoryImportError }
  // ⚠️ `Omit<union>`은 union을 접어 갈래별 필드(`reason`)를 지운다 — 판정(`NightlyPlan`)과 같은 모양을 손으로 적는다.
  | { action: "skip"; outcome: "upToDate" }
  | { action: "skip"; outcome: "deferred"; reason: "open-pr" | "pr-check-failed" }
  | { action: "skip"; outcome: "failed"; reason: "base-unreadable"; branchMissing: boolean }
  | { action: "none"; counter: "notReady" | "unprocessed" };

/** 판정의 스킵·없음 갈래가 위 모양과 같은지 컴파일 타임에 잰다 — 판정에 갈래가 늘면 여기서 걸린다. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const planned: Same<Extract<NightlyPlan, { action: "skip" | "none" }>, Extract<NightlyVisit, { action: "skip" | "none" }>> = true;
void planned;

/** 로그 줄에 **0이어도** 싣는 주 카운터. 부재와 0이 구별되어야 grep이 성립한다. */
const MAIN = ["targets", "published", "imported", "skipped", "deferred", "failed", "notReady", "unprocessed", "deadline"] as const;

/** `runSync`가 행 없이 돌려보내는 실행권 거부 — 사건이 없는 갈래라 실패가 아니라 코드별 거부다(spec 8). */
const PUBLISH_REFUSALS: readonly string[] = ["already-running", "too-soon"];

/**
 * 야간 요약 한 줄 (`[pull] targets= published= imported= skipped= deferred= failed= notReady= unprocessed= deadline= …`).
 *
 * 주 카운터 뒤에 **세부 카운터**가 붙는다(0이면 뺀다, 이름 순): `deferred.<사유>` · `skipped.<Publish 스킵 사유>` · `refused.<코드>`(사건 없는
 * 거부 — 적재·Publish 모두 코드별) · `failed.base-unreadable` · `partial`(imported 안의 부분 적재) · `superseded`(skipped 안의 대체).
 * ⚠️ `refused.*`는 주 카운터 어디에도 더하지 않는다 — 사건이 없는 갈래라 성공·실패 어느 쪽도 아니다.
 * ⚠️ `published`는 **보낸 것**(committed)만이다 — Publish 갈래의 스킵(no-changes·withheld·writer-warnings…)은 `skipped`다.
 *
 * @param budgetUnprocessed 루프 예산·상한으로 **방문하지 않은** 수 — 그대로 `unprocessed`다. 방문했지만 마감으로 멈춘 항목(`none unprocessed`)은
 *   결과 배열에 있으므로 `deadline`으로 따로 센다. 둘을 합치면 `targets + unprocessed`가 고른 수보다 커진다(두 번 센다).
 */
export function summarizeNightly(items: readonly PullItem[], budgetUnprocessed: number): { counts: Record<string, number>; line: string } {
  const counts: Record<string, number> = Object.create(null) as Record<string, number>;
  const add = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  for (const key of MAIN) counts[key] = 0;
  counts.targets = items.length;
  counts.unprocessed = budgetUnprocessed;
  for (const item of items) {
    if (!("action" in item)) { add("failed"); continue; }
    switch (item.action) {
      case "publish":
        if (item.status === "failed") add(PUBLISH_REFUSALS.includes(item.error) ? `refused.${item.error}` : "failed");
        else if (item.status === "skipped") { add("skipped"); add(`skipped.${item.reason}`); }
        else add("published");
        break;
      case "import":
        if (!item.recorded) { add(`refused.${item.error}`); break; }
        if (item.result === "imported" || item.result === "partial") { add("imported"); if (item.result === "partial") add("partial"); }
        else if (item.result === "deferred") { add("deferred"); if (item.deferReason !== null) add(`deferred.${item.deferReason}`); }
        else if (item.result === "superseded") { add("skipped"); add("superseded"); }
        else add("failed");
        break;
      case "skip":
        if (item.outcome === "upToDate") add("skipped");
        else if (item.outcome === "deferred") { add("deferred"); add(`deferred.${item.reason}`); }
        else { add("failed"); add(`failed.${item.reason}`); }
        break;
      default:
        add(item.counter === "unprocessed" ? "deadline" : item.counter);
    }
  }
  const main = MAIN.map((key) => `${key}=${counts[key] ?? 0}`);
  const extras = Object.keys(counts).filter((key) => !(MAIN as readonly string[]).includes(key) && (counts[key] ?? 0) > 0).sort().map((key) => `${key}=${counts[key]}`);
  return { counts, line: ["[pull]", ...main, ...extras].join(" ") };
}
