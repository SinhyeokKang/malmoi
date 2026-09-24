import { describe, expect, it } from "vitest";

import {
  planDiscardConfirmation,
  planProtectedImport,
  planProtectedPublish,
} from "../plan";

/**
 * sync-edit-protection의 순수 판정 셋 (ARCHITECTURE §5.5.2). **I/O가 0이다** — 보류·폐기·전달 확인의 "해도 되는가"가
 * 전부 여기서 결정되고, 껍데기는 그 답을 조건부 UPDATE로 감쌀 뿐이다.
 *
 * 테스트 이름의 `[C#]`은 spec 완료 조건 번호다. "0회/없음" 단언은 같은 입력 축의 양성 대조와 짝이다
 * (POSTMORTEM 2026-09-14 "방어선 셋 다 지워도 green").
 */

describe("planProtectedImport — 자동 적재는 리포를 보지 않고 pending 수로만 가른다", () => {
  it("[C3] 자동 · pending 0 → apply (기존 strict 그대로)", () => {
    expect(planProtectedImport({ mode: "auto", pending: 0 })).toEqual({ action: "apply" });
  });

  it("[C1][C2] 자동 · pending 1 → defer, apply가 아니다", () => {
    expect(planProtectedImport({ mode: "auto", pending: 1 })).toEqual({ action: "defer", reason: "pending-edits", pendingCount: 1 });
  });

  it("[C2] 자동 · pending N → pendingCount가 N이다", () => {
    expect(planProtectedImport({ mode: "auto", pending: 42 })).toMatchObject({ action: "defer", pendingCount: 42 });
  });

  it("[C4] 수동 · pending 0 → 승인 없이 apply (폐기할 것이 없다)", () => {
    expect(planProtectedImport({ mode: "manual", pending: 0, approved: false })).toEqual({ action: "apply" });
  });

  it("[C4] 수동 · pending > 0 · 승인 일치 → apply", () => {
    expect(planProtectedImport({ mode: "manual", pending: 3, approved: true })).toEqual({ action: "apply" });
  });

  it("[C4] 수동 · pending > 0 · 승인 불일치 → reject(reconfirm), apply가 아니다", () => {
    expect(planProtectedImport({ mode: "manual", pending: 3, approved: false })).toEqual({ action: "reject", reason: "reconfirm" });
  });
});

describe("planProtectedPublish — pending 0이면 GitHub에 닿기 전에 끝난다", () => {
  it("[C5] pending 0 → skip(no-edits)", () => {
    expect(planProtectedPublish({ pending: 0, writerWarnings: 0 })).toEqual({ action: "skip", reason: "no-edits" });
  });

  it("[C5] pending 0이면 경고가 있어도 skip이다 — 렌더 전에 판정한다", () => {
    expect(planProtectedPublish({ pending: 0, writerWarnings: 2 })).toEqual({ action: "skip", reason: "no-edits" });
  });

  it("[C10] pending > 0 · writer 경고 → reject, proceed가 아니다", () => {
    expect(planProtectedPublish({ pending: 1, writerWarnings: 2 })).toEqual({ action: "reject", reason: "writer-warnings", warnings: 2 });
  });

  it("[C6] pending > 0 · 경고 없음 → proceed (양성 대조)", () => {
    expect(planProtectedPublish({ pending: 1, writerWarnings: 0 })).toEqual({ action: "proceed" });
  });
});

describe("planDiscardConfirmation — 폐기는 OWNER의 일치하는 지문만 연다", () => {
  it("[C4] OWNER · 지문 일치 → proceed", () => {
    expect(planDiscardConfirmation({ role: "OWNER", fingerprintMatches: true })).toEqual({ action: "proceed" });
  });

  it("[C4] OWNER · 같은 건수 다른 편집(지문 불일치) → reconfirm", () => {
    expect(planDiscardConfirmation({ role: "OWNER", fingerprintMatches: false })).toEqual({ action: "reconfirm" });
  });

  it("[C4] EDITOR 직접 호출 → reject, 지문이 일치해도", () => {
    expect(planDiscardConfirmation({ role: "EDITOR", fingerprintMatches: true })).toEqual({ action: "reject", reason: "forbidden" });
  });
});
