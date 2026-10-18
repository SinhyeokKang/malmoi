import { describe, expect, it, vi } from "vitest";
import { planPublishButton, planPublishView, planSettleLookup, planWithheldLines } from "../plan";
import { en } from "@/messages/en";
import { buildPublishDiff, type PublishCell } from "../diff";
import { summarizeWarnings } from "../warnings";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import { parseGithubPrUrl } from "@/lib/projects/pr-url";
import { SYNC_ERROR_CODES, planSyncFinish } from "@/lib/sync/plan";
import type { PullResult } from "@/lib/pull/run";

const committed = { status: "committed", delivered: 1, pr: "created", prUrl: "https://github.com/o/r/pull/12", commitSha: "abc", changed: ["ko.json"] as string[], changedValues: 1 } as const;
it("실행 결과 여덟 갈래와 스킵 경고를 보존한다", () => {
  expect(planPublishView(committed)).toBe("created");
  expect(planPublishView({ ...committed, pr: "updated" })).toBe("updated");
  // writer 경고는 **보내지 않은** 결과다(sync-edit-protection T10) — 기존 Warnings 갈래가 "보내지 않았다"로 선다.
  expect(planPublishView({ status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "web", path: "ko.json", code: "root-not-object" }] })).toBe("partial");
  for (const reason of ["no-edits", "no-changes"] as const) expect(planPublishView({ status: "skipped", reason })).toBe("no-changes");
  for (const error of ["already-running", "too-soon"] as const) expect(planPublishView({ status: "failed", error, delivery: "not-started" })).toBe(error);
  for (const error of ["unauthorized", "not-found", "archived", "not-ready", "invalid input", "unavailable"]) {
    expect(planPublishView({ status: "failed", error, retryable: error === "unavailable", delivery: "not-started" })).toBe(error === "unavailable" ? "transient-error" : "config-error");
  }
  for (const code of SYNC_ERROR_CODES) {
    const retryable = !["base-unreadable", "not-installed", "glob-matched-nothing"].includes(code);
    expect(planPublishView({ status: "failed", error: "safe", code, retryable, delivery: "unknown" })).toBe(retryable ? "transient-error" : "config-error");
  }
});
/**
 * **보류는 실린 수와 따로 한 줄이다** (delivery-invariants D7). 실린 0 + 보류만이면 "No changes"(파일이 같았다)가 거짓이 되므로
 * 기존 Not sent 틀(`partial`)을 쓴다. 문구는 역할별로 화면에 있는 컨트롤만 가리킨다(POSTMORTEM 2026-09-14).
 */
it("skipped/withheld는 Not sent 틀이다 — No changes가 아니다", () => {
  expect(planPublishView({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 } })).toBe("partial");
  // #83 — 보류가 있으면 Logs가 Not sent로 읽는다(SKIPPED + withheld > 0). 모달도 같은 틀이어야 "nothing to send"를 약속하지 않는다.
  expect(planPublishView({ status: "skipped", reason: "no-changes", withheld: { file: 1, key: 0 } })).toBe("partial");
  expect(planPublishView({ status: "skipped", reason: "no-changes" })).toBe("no-changes");
});
it("보류 줄 — 사유별 한 줄 + 역할별 다음 행동 · 보류 0이면 줄이 없다 (짝)", () => {
  const p = en.translations.publish;
  expect(planWithheldLines(en, { ...committed, withheld: { file: 2, key: 0 } }, "EDITOR")).toEqual([`${p.withheld.file(2)} ${p.withheld.editor}`]);
  // #129 — Revert를 가리키는 것은 보류된 셀 전부에 기준이 있을 때뿐이다(`revertable`). 모르면 Revert 없는 안내다 — 화면에서 꺼진 버튼을 가리키지 않는다.
  expect(planWithheldLines(en, { ...committed, withheld: { file: 0, key: 1 } }, "OWNER")).toEqual([`${p.withheld.key(1)} ${p.withheld.owner.keyNoRevert}`]);
  expect(planWithheldLines(en, { ...committed, withheld: { file: 0, key: 1, revertable: true } }, "OWNER")).toEqual([`${p.withheld.key(1)} ${p.withheld.owner.key}`]);
  expect(planWithheldLines(en, { status: "skipped", reason: "withheld", withheld: { file: 1, key: 1 } }, "OWNER"))
    .toEqual([`${p.withheld.file(1)} ${p.withheld.owner.fileNoRevert}`, `${p.withheld.key(1)} ${p.withheld.owner.keyNoRevert}`]);
  expect(planWithheldLines(en, { status: "skipped", reason: "withheld", withheld: { file: 1, key: 1, revertable: true } }, "OWNER"))
    .toEqual([`${p.withheld.file(1)} ${p.withheld.owner.file}`, `${p.withheld.key(1)} ${p.withheld.owner.key}`]);
  // Revert 없는 안내는 Revert를 말하지 않는다.
  expect(p.withheld.owner.keyNoRevert).not.toContain("Revert");
  expect(p.withheld.owner.fileNoRevert).not.toContain("Revert");
  expect(planWithheldLines(en, committed, "OWNER")).toEqual([]);
  expect(planWithheldLines(en, { status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "web", path: "ko.json", code: "root-not-object" }] }, "OWNER")).toEqual([]);
});
it("0건은 비활성이나 실행 중에는 재열기가 우선한다", () => {
  expect(planPublishButton(en, { count: 0, paused: false, otherPending: false, publishPending: false })).toMatchObject({ mode: "preview", disabled: true, badge: null, hint: expect.any(String) });
  expect(planPublishButton(en, { count: 0, paused: true, otherPending: true, publishPending: true })).toMatchObject({ mode: "progress", disabled: false, badge: null });
  expect(planPublishButton(en, { count: 2, paused: false, otherPending: true, publishPending: false }).disabled).toBe(true);
});
/** 언어 변경이 뺀 언어의 편집(`withheld.language`)은 파일 복구 권유에서 빠진다 — 언어 줄(Held)이 이유를 말한다(R-E3 Y1). */
it("보류 줄은 언어 보류를 빼고 센다", () => {
  const w = en.translations.publish.withheld;
  expect(planWithheldLines(en, { status: "committed", pr: "created", prUrl: "u", commitSha: "c", changedValues: null, delivered: 1, changed: [], withheld: { file: 1, key: 0, language: 1 } }, "OWNER")).toEqual([]);
  expect(planWithheldLines(en, { status: "committed", pr: "created", prUrl: "u", commitSha: "c", changedValues: null, delivered: 1, changed: [], withheld: { file: 3, key: 0, language: 1 } }, "EDITOR"))
    .toEqual([`${w.file(2)} ${w.editor}`]);
});
/** 셀 편집 0 · 언어 작업만 (locale-add 시안 P1 ①④) — 켜지고 배지는 없으며(셀 수) 켜진 이유를 hint가 sr로 말한다. 멈춤 사유가 그보다 앞선다. */
it("언어 작업만 있으면 켜지고 배지 없이 이유를 말한다", () => {
  expect(planPublishButton(en, { count: 0, languageWork: 1, paused: false, otherPending: false, publishPending: false }))
    .toEqual({ mode: "preview", disabled: false, badge: null, hint: en.translations.publish.language.ready });
  expect(planPublishButton(en, { count: 0, languageWork: 1, paused: true, otherPending: false, publishPending: false, pausedReason: "Archived." }))
    .toMatchObject({ disabled: true, hint: "Archived." });
  expect(planPublishButton(en, { count: 3, languageWork: 1, paused: false, otherPending: false, publishPending: false })).toMatchObject({ disabled: false, badge: 3, hint: "" });
});
/**
 * **전달된 언어 요청의 PR이 더는 열려 있지 않으면 켠다** (#282 — ARCHITECTURE §5.10.4 `settle`). 셀·언어 작업이 0이라 지금은 `nothing`으로 꺼지는 창이다.
 * 진행·멈춤 판정은 그대로 이긴다.
 */
it("settle이 오면 셀·언어 작업 0이어도 켜지고 정리 힌트를 단다 — 없으면 지금처럼 nothing", () => {
  expect(planPublishButton(en, { count: 0, languageWork: 0, settle: true, paused: false, otherPending: false, publishPending: false }))
    .toEqual({ mode: "preview", disabled: false, badge: null, hint: en.translations.publish.language.settle.hint });
  expect(planPublishButton(en, { count: 0, languageWork: 0, settle: false, paused: false, otherPending: false, publishPending: false }))
    .toMatchObject({ disabled: true, hint: en.translations.publish.nothing });
  expect(planPublishButton(en, { count: 0, settle: true, paused: true, otherPending: false, publishPending: false, pausedReason: "Archived." }))
    .toMatchObject({ disabled: true, hint: "Archived." });
  expect(planPublishButton(en, { count: 0, settle: true, paused: false, otherPending: false, publishPending: true })).toMatchObject({ mode: "progress", disabled: false });
  // 셀 편집·언어 작업이 있으면 settle은 판정에 끼지 않는다 — 기존 힌트 그대로다.
  expect(planPublishButton(en, { count: 0, languageWork: 1, settle: true, paused: false, otherPending: false, publishPending: false }).hint).toBe(en.translations.publish.language.ready);
});

/**
 * **조회는 좁은 창에서만 만든다** (#282) — 셀·언어 작업이 0이고, 행이 전달된 PR을 기다리고, 조회가 의미 있는(게이트·연결) 때만이다. 그 밖에서는 promise를
 * 만들지 않는다 — 번역 화면이 키 클릭·저장마다 다시 렌더되므로, 창 밖 조회는 번역자마다 호스트 호출을 늘린다.
 */
describe("planSettleLookup", () => {
  const window = { count: 0, languageWork: 0, awaiting: true, applies: true };
  it.each([
    ["미발송 편집이 있다", { ...window, count: 1 }],
    ["언어 작업이 있다", { ...window, languageWork: 1 }],
    ["전달된 요청을 기다리지 않는다", { ...window, awaiting: false }],
    ["조회가 의미 없다(게이트·연결)", { ...window, applies: false }],
  ])("창 밖(%s)이면 조회하지 않는다", (_name, input) => {
    const lookup = vi.fn(async () => null);
    expect(planSettleLookup(input, lookup)).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("창 안이면 한 번 조회하고, 열린 PR 없음(null)만 참이다 — 열림·모름·거부는 거짓", async () => {
    for (const [answer, expected] of [[null, true], ["https://example.test/pull/2", false], [undefined, false]] as const) {
      const lookup = vi.fn(async () => answer);
      expect(await planSettleLookup(window, lookup)).toBe(expected);
      expect(lookup).toHaveBeenCalledTimes(1);
    }
    expect(await planSettleLookup(window, () => Promise.reject(new Error("boom")))).toBe(false);
  });
});

const cell = (over: Partial<PublishCell> = {}): PublishCell => ({ surface: "web", path: "ko.json", keyId: "k1", key: "hello", localeCode: "ko", after: "new", author: "Editor", updatedAt: "2026-09-16", ...over });
it("파일·키·로케일로 정렬하고 키 병합과 상한 초과 수를 센다", () => {
  const rows = [cell({ localeCode: "ko" }), cell({ localeCode: "en" }), cell({ keyId: "k2", key: "z" })];
  const result = buildPublishDiff(rows, {}, 2);
  expect(result.truncated).toBe(1);
  expect(result.groups[0]?.rows.map(r => [r.localeCode, r.keySpan])).toEqual([["en", 2], ["ko", 0]]);
  expect(buildPublishDiff(rows, {}, 3).truncated).toBe(0);
  expect(buildPublishDiff([], {}).groups).toEqual([]);
});
it("프로토타입 경로·로케일·키를 상속 조회하지 않는다", () => {
  const row = cell({ path: "__proto__", localeCode: "constructor", key: "toString" });
  expect(buildPublishDiff([row], {}).groups[0]?.rows[0]?.before).toBeNull();
  const base = Object.create(null);
  base.__proto__ = Object.create(null);
  base.__proto__.constructor = Object.create(null);
  base.__proto__.constructor.toString = "old";
  expect(buildPublishDiff([row], base).groups[0]?.rows[0]?.before).toBe("old");
  expect(buildPublishDiff([row], base)).toEqual(buildPublishDiff([row], base));
});
it("경고를 파일별로 묶되 파서 원문의 개행을 보존한다", () => {
  const groups = summarizeWarnings([
    { surfaceSlug: "web", path: "ko.yml", code: "parse-failed", detail: "bad\n  x\n  ^" },
    { surfaceSlug: "web", path: "ko.yml", code: "root-not-object" },
  ], (warning) => adapterErrorMessage(warning, en.adapterErrors));
  expect(groups).toEqual([{ file: "web: ko.yml", messages: [`${en.adapterErrors["parse-failed"]} (bad\n  x\n  ^)`, en.adapterErrors["root-not-object"]] }]);
});
it("PR URL은 원본 리포·origin·양의 안전 정수를 검증하고 삼상태를 보존한다", () => {
  const repo = { repoOwner: "o", repoName: "r" };
  expect(parseGithubPrUrl(null, repo)).toBeNull();
  expect(parseGithubPrUrl(undefined, repo)).toBeUndefined();
  expect(parseGithubPrUrl(committed.prUrl, repo)).toEqual({ number: 12, url: committed.prUrl });
  for (const raw of ["https://evil.com/o/r/pull/1", "https://github.com/x/r/pull/1", "https://u@github.com/o/r/pull/1", "https://github.com/o/r/pull/0", "https://github.com/o/r/pull/9007199254740992", "broken"]) expect(parseGithubPrUrl(raw, repo)).toBeUndefined();
});

it("바뀐 단어만 표시하고 공백·여러 줄을 보존한다", async () => {
  const { diffWords } = await import("../words");
  const result = diffWords("hello old\nworld", "hello new\nworld");
  expect(result.before.filter(t => t.changed).map(t => t.text).join("")).toBe("old");
  expect(result.after.filter(t => t.changed).map(t => t.text).join("")).toBe("new");
  expect(result.before.map(t => t.text).join("")).toBe("hello old\nworld");
  expect(diffWords("", "")).toEqual({ before: [], after: [] });
});

/**
 * B1 r3 — 되돌린 편집(값이 base와 같다)은 "바뀐다"가 아니다. 행이 그 사실을 들고(`same`), 수가 그 행을 센다(`same` 합계).
 * 열린 PR이 있으면 그 PR의 변경을 되돌리는 것이고, 전부 그렇다면 실행은 no-changes 경로다.
 */
it("base와 같은 값의 행은 same이고 diff가 그 수를 센다 · 다른 값은 아니다 (짝)", () => {
  const diff = buildPublishDiff([cell({ after: "old" }), cell({ keyId: "k2", key: "bye", after: "new" })], { "ko.json": { ko: { hello: "old", bye: "old" } } });
  const rows = diff.groups.flatMap(g => g.rows);
  expect(rows.map(r => [r.key, r.same])).toEqual([["bye", false], ["hello", true]]);
  expect(diff.same).toBe(1);
});

/**
 * fix1 Y1 (#267) — 머지 없이 닫힌 PR/MR의 언어 요청을 버리고 끝난 no-edits는 "파일이 같았다"가 아니다.
 * #289 — 보류한 값도 없다(Home To send 0 · Logs `Nothing to send`) — Held back이 아니라 요청을 닫았다 틀이다. 보류가 실제로 있으면(`withheld`) Held back 그대로다.
 * 리포가 이미 요청대로였으면(머지) "이미 리포에 있다"가 참이라 No changes 그대로다.
 */
it("no-edits + 리포에 없는 채로 버린 언어 요청은 요청을 닫았다 틀이다 — 보류가 있으면 Held back · 리포에 반영된 요청만이면 No changes", () => {
  const dropped = { surfaceSlug: "s", localeCode: "fr", operation: "ADD", presence: "orphan" } as const;
  expect(planPublishView({ status: "skipped", reason: "no-edits", expired: [dropped] })).toBe("request-closed");
  expect(planPublishView({ status: "skipped", reason: "no-edits", expired: [{ surfaceSlug: "s", localeCode: "ko", operation: "REMOVE", presence: "active" }] })).toBe("request-closed");
  expect(planPublishView({ status: "skipped", reason: "no-edits", expired: [dropped, { surfaceSlug: "s", localeCode: "ko", operation: "REMOVE", presence: "orphan" }] })).toBe("request-closed");
  expect(planPublishView({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 }, expired: [dropped] })).toBe("partial");
  expect(planPublishView({ status: "skipped", reason: "no-edits", expired: [{ surfaceSlug: "s", localeCode: "ko", operation: "REMOVE", presence: "orphan" }] })).toBe("no-changes");
});

/**
 * #289 review 🟡1 — 결과 모달(`planPublishView`, `reason`을 본다)과 Logs(`SyncRun` 컬럼 — `eventResult`가 `withheld > 0 || warnings > 0`이면 Held back)는
 * 같은 실행을 다른 입력으로 판정한다(POSTMORTEM 2026-09-27). 스킵 결과에서 모달의 Held back(`partial`) ⇔ Logs의 Held back이어야 둘이 갈리지 않는다.
 * ⚠️ `reconfirm`은 표본에 없다 — 웹 Publish는 지문을 넘기지 않아 모달에 닿지 않는다(Logs는 `errorCode`로 따로 Held back이다).
 */
it("스킵 결과의 모달 Held back ⇔ Logs Held back — 요청만 닫은 실행은 둘 다 아니다 (#289)", () => {
  const dropped = { surfaceSlug: "s", localeCode: "fr", operation: "ADD", presence: "orphan" } as const;
  const reached = { surfaceSlug: "s", localeCode: "ko", operation: "REMOVE", presence: "orphan" } as const;
  const samples: PullResult[] = [
    { status: "skipped", reason: "no-edits" },
    { status: "skipped", reason: "no-edits", expired: [dropped] },
    { status: "skipped", reason: "no-edits", expired: [reached] },
    { status: "skipped", reason: "no-edits", expired: [dropped, reached] },
    { status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 }, expired: [dropped] },
    { status: "skipped", reason: "writer-warnings", warnings: [{ surfaceSlug: "s", path: "ko.json", code: "parse-failed" }], expired: [dropped] },
    { status: "skipped", reason: "no-changes", withheld: { file: 0, key: 2 } },
    { status: "skipped", reason: "no-changes" },
  ];
  for (const result of samples) {
    const row = planSyncFinish(result);
    expect([JSON.stringify(result), planPublishView(result) === "partial"]).toEqual([JSON.stringify(result), row.withheld > 0 || row.warnings > 0]);
  }
  expect(planSyncFinish({ status: "skipped", reason: "no-edits", expired: [dropped] })).toMatchObject({ status: "SKIPPED", withheld: 0, warnings: 0 });
});
