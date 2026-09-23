import { describe, expect, it } from "vitest";
import {
  planBaselineOnSave,
  planKeyRevert,
  planPublishBaselines,
  restoreValueOf,
  revertSettled,
  type RevertTarget,
} from "../baseline";

/**
 * 전달 baseline — **미전달 셀 delta 설계** (translation-rework T4 — design §10.3·§10.4, 사용자 결정 2026-09-23).
 *
 * 소스별 전달 확인 레코드가 유효하면 "미전달이 아닌 활성 셀의 현재 값 = 마지막 확인된 export 값"이다. 그래서
 * baseline 행은 **셀이 미전달이 되는 순간**(Save)과 **캡처 뒤 재편집된 셀**(Publish 성공)에만 생긴다.
 * ⚠️ 복원값은 **DB 유래**이고 현재 리포를 읽어 고르지 않는다 — 승자 선택이 생기면 "병합 없음"이 깨진다.
 */
describe("restoreValueOf — export와 같은 폴백 (buildWriteEntries)", () => {
  it("비어 있지 않은 값은 그대로다", () => {
    expect(restoreValueOf({ value: "안녕", isBase: false, sourceText: "Hi" })).toBe("안녕");
    expect(restoreValueOf({ value: " 공백 ", isBase: true, sourceText: "Hi" })).toBe(" 공백 ");
  });

  it("base의 부재·빈값은 원문이다 (POSTMORTEM 2026-09-09 — 셀을 비우면 키가 사라짐)", () => {
    expect(restoreValueOf({ value: null, isBase: true, sourceText: "Hi" })).toBe("Hi");
    expect(restoreValueOf({ value: "", isBase: true, sourceText: "Hi" })).toBe("Hi");
  });

  it("base 원문까지 비면 빈 문자열이다", () => {
    expect(restoreValueOf({ value: null, isBase: true, sourceText: "" })).toBe("");
  });

  it("비-base의 부재·빈값은 빈 문자열이다 — 파일에서 빠진 미번역", () => {
    expect(restoreValueOf({ value: null, isBase: false, sourceText: "Hi" })).toBe("");
    expect(restoreValueOf({ value: "", isBase: false, sourceText: "Hi" })).toBe("");
  });
});

describe("planBaselineOnSave — 셀이 미전달이 되는 순간에만 기록", () => {
  const base = { changed: true, wasPending: false, confirmationValid: true, publishInFlight: false, before: { value: "옛값", isBase: false, sourceText: "Hi" } };

  it("미전달이 아니던 셀을 바꾸면 직전 값을 기록한다", () => {
    expect(planBaselineOnSave(base)).toEqual({ record: true, restoreValue: "옛값" });
  });

  it("직전 값은 export 폴백으로 유도한다", () => {
    expect(planBaselineOnSave({ ...base, before: { value: null, isBase: true, sourceText: "Hi" } })).toEqual({ record: true, restoreValue: "Hi" });
  });

  it("no-op 저장은 기록하지 않는다", () => {
    expect(planBaselineOnSave({ ...base, changed: false })).toEqual({ record: false, reason: "unchanged" });
  });

  it("이미 미전달인 셀의 재저장은 기준을 바꾸지 않는다", () => {
    expect(planBaselineOnSave({ ...base, wasPending: true })).toEqual({ record: false, reason: "already-pending" });
  });

  it("소스 전달 확인 레코드가 무효면 기록하지 않는다 — 그 셀은 unknown이다", () => {
    expect(planBaselineOnSave({ ...base, confirmationValid: false })).toEqual({ record: false, reason: "no-confirmation" });
  });

  it("Publish 진행 중이면 기록하지 않는다 — 현재 값이 확인된 export인지 아직 모른다", () => {
    expect(planBaselineOnSave({ ...base, publishInFlight: true })).toEqual({ record: false, reason: "publish-in-flight" });
  });
});

describe("planPublishBaselines — 성공 확정 tx는 캡처한 미전달 셀만 다룬다", () => {
  const captured = [
    { cellId: "a", token: "t1", restoreValue: "A1" },
    { cellId: "b", token: "t2", restoreValue: "B1" },
    { cellId: "c", token: "t3", restoreValue: "C1" },
  ];

  it("토큰이 그대로인 셀은 전달됐다 — 기준 행이 더 필요 없다", () => {
    const plan = planPublishBaselines(captured, new Map([["a", "t1"], ["b", "t2"], ["c", "t3"]]));
    expect(plan).toEqual({ release: ["a", "b", "c"], rebase: [] });
  });

  it("캡처 뒤 재편집된 셀(A 전송 중 B 저장)은 기준을 캡처값 A로 바꾸고 pending을 남긴다", () => {
    const plan = planPublishBaselines(captured, new Map([["a", "t1"], ["b", "t2-new"], ["c", "t3"]]));
    expect(plan).toEqual({ release: ["a", "c"], rebase: [{ cellId: "b", restoreValue: "B1" }] });
  });

  it("토큰이 이미 비워진 셀은 건드리지 않는다", () => {
    const plan = planPublishBaselines(captured, new Map([["a", null], ["b", "t2"], ["c", "t3"]]));
    expect(plan).toEqual({ release: ["b", "c"], rebase: [] });
  });

  it("사라진 셀(조회 결과에 없음)은 건드리지 않는다", () => {
    expect(planPublishBaselines(captured, new Map([["a", "t1"]]))).toEqual({ release: ["a"], rebase: [] });
  });

  it("프로토타입 이름의 셀 id도 Map으로 조회한다", () => {
    const plan = planPublishBaselines([{ cellId: "constructor", token: "t", restoreValue: "x" }], new Map([["constructor", "t"]]));
    expect(plan).toEqual({ release: ["constructor"], rebase: [] });
  });
});

describe("revertSettled — 교체된 실행의 외부 쓰기 종료 (design §10.4)", () => {
  const t = (iso: string) => new Date(iso);

  it("미해결 실행이 없으면 종료가 확인된 것이다", () => {
    expect(revertSettled({ unsettledRunStartedAt: null, confirmationRunStartedAt: t("2026-09-23T00:00:00Z"), staleAfterSeconds: 300 })).toBe(true);
  });

  it("미해결 실행의 startedAt+300초 뒤에 시작한 성공 확인이 있어야 열린다", () => {
    const unsettled = t("2026-09-23T00:00:00Z");
    expect(revertSettled({ unsettledRunStartedAt: unsettled, confirmationRunStartedAt: t("2026-09-23T00:05:00Z"), staleAfterSeconds: 300 })).toBe(true);
    expect(revertSettled({ unsettledRunStartedAt: unsettled, confirmationRunStartedAt: t("2026-09-23T00:04:59Z"), staleAfterSeconds: 300 })).toBe(false);
  });

  it("시간이 지났어도 그 뒤 새 전달 확인이 없으면 열리지 않는다", () => {
    expect(revertSettled({ unsettledRunStartedAt: t("2026-09-23T00:00:00Z"), confirmationRunStartedAt: t("2026-09-22T00:00:00Z"), staleAfterSeconds: 300 })).toBe(false);
  });
});

describe("planKeyRevert — 대상 전체가 복원 가능할 때만", () => {
  const confirmation = { revision: "rev2", valid: true, settled: true };
  const targets: RevertTarget[] = [
    { localeCode: "ko", token: "tk", currentValue: "B-ko", needsReview: true },
    { localeCode: "ja", token: "tj", currentValue: "B-ja", needsReview: false },
  ];
  const baselines = new Map([
    ["ko", { restoreValue: "A-ko", revision: "rev2" }],
    ["ja", { restoreValue: "A-ja", revision: "rev2" }],
  ]);
  const ok = { targets, baselines, confirmation, canRevert: true, draftDirty: false, busy: false };

  it("모든 미전달 셀을 기준값으로 쓰고 캡처한 토큰 조건으로 해제한다", () => {
    expect(planKeyRevert(ok)).toEqual({
      ok: true,
      writes: [
        { localeCode: "ko", value: "A-ko", expectedToken: "tk" },
        { localeCode: "ja", value: "A-ja", expectedToken: "tj" },
      ],
    });
  });

  it("needsReview를 쓰기 대상에 넣지 않는다 — 복원은 검토 완료가 아니다", () => {
    const plan = planKeyRevert(ok);
    if (!plan.ok) throw new Error("unreachable");
    for (const write of plan.writes) expect(write).not.toHaveProperty("needsReview");
  });

  it("현재 값과 기준값이 같아도 쓴다 — pending 해제가 일어나므로 no-op이 아니다", () => {
    const same = planKeyRevert({ ...ok, targets: [{ localeCode: "ko", token: "tk", currentValue: "A-ko", needsReview: false }] });
    expect(same).toEqual({ ok: true, writes: [{ localeCode: "ko", value: "A-ko", expectedToken: "tk" }] });
  });

  it("EDITOR는 거부된다", () => {
    expect(planKeyRevert({ ...ok, canRevert: false })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("미저장 draft가 있거나 저장·Publish·Sync 중이면 실행하지 않는다", () => {
    expect(planKeyRevert({ ...ok, draftDirty: true })).toEqual({ ok: false, reason: "unsaved" });
    expect(planKeyRevert({ ...ok, busy: true })).toEqual({ ok: false, reason: "busy" });
  });

  it("미전달 셀이 없으면 되돌릴 것이 없다", () => {
    expect(planKeyRevert({ ...ok, targets: [] })).toEqual({ ok: false, reason: "nothing" });
  });

  it("기준이 없는 셀이 하나라도 있으면 전체 불가다 — 부분 복원을 만들지 않는다", () => {
    const partial = new Map([["ko", { restoreValue: "A-ko", revision: "rev2" }]]);
    expect(planKeyRevert({ ...ok, baselines: partial })).toEqual({ ok: false, reason: "baseline-unknown", localeCodes: ["ja"] });
  });

  it("전달 확인 레코드가 없거나 무효면 stale이다", () => {
    expect(planKeyRevert({ ...ok, confirmation: null })).toEqual({ ok: false, reason: "baseline-unknown", localeCodes: ["ko", "ja"] });
    expect(planKeyRevert({ ...ok, confirmation: { ...confirmation, valid: false } })).toEqual({ ok: false, reason: "baseline-stale" });
  });

  it("기준의 revision이 현재 확인과 다르면 stale이다 — context·설정 변경 뒤의 옛 기준", () => {
    const old = new Map([...baselines, ["ja", { restoreValue: "A-ja", revision: "rev1" }]]);
    expect(planKeyRevert({ ...ok, baselines: old })).toEqual({ ok: false, reason: "baseline-stale" });
  });

  it("교체된 실행의 종료가 확인되지 않았으면 쓰기 0건으로 막는다", () => {
    expect(planKeyRevert({ ...ok, confirmation: { ...confirmation, settled: false } })).toEqual({ ok: false, reason: "unsettled" });
  });

  it("권한 거부가 다른 사유보다 먼저다 — EDITOR에게 기준 상태를 흘리지 않는다", () => {
    expect(planKeyRevert({ ...ok, canRevert: false, confirmation: null, draftDirty: true })).toEqual({ ok: false, reason: "forbidden" });
  });
});
