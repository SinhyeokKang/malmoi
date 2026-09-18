import { describe, expect, it } from "vitest";

import {
  planDiscardConfirmation,
  planProtectedImport,
  planProtectedPublish,
  planSyncProtectionView,
} from "../plan";

/**
 * sync-edit-protection의 순수 판정 넷 (ARCHITECTURE §5.5.2). **I/O가 0이다** — 보류·폐기·전달 확인의 "해도 되는가"가
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

describe("planSyncProtectionView — 보호 상태의 화면 갈래", () => {
  it("[C11] pending 0 → 배너 없음·Home 보조 줄 없음", () => {
    const view = planSyncProtectionView({ pending: 0, role: "OWNER" });
    expect(view.banner).toBeNull();
    expect(view.homeSubline).toBeNull();
  });

  it("[C11] pending > 0 → 배너가 건수를 들고, 출구가 비어 있지 않으며 Publish가 첫째다", () => {
    const view = planSyncProtectionView({ pending: 4, role: "OWNER" });
    expect(view.banner).not.toBeNull();
    expect(view.banner?.pendingCount).toBe(4);
    expect(view.banner?.exits.length).toBeGreaterThan(0);
    expect(view.banner?.exits[0]).toBe("publish");
  });

  it("[C11] EDITOR의 출구는 Publish뿐이다 — 폐기 출구가 없다 (OWNER → 있음 대조)", () => {
    expect(planSyncProtectionView({ pending: 1, role: "EDITOR" }).banner?.exits).toEqual(["publish"]);
    expect(planSyncProtectionView({ pending: 1, role: "OWNER" }).banner?.exits).toContain("discard");
  });

  it("[C11] EDITOR에게 Sync CTA가 없다 (OWNER → 있음 대조)", () => {
    expect(planSyncProtectionView({ pending: 1, role: "EDITOR" }).sync).toBeNull();
    expect(planSyncProtectionView({ pending: 1, role: "OWNER" }).sync).not.toBeNull();
  });

  it("[C4] Sync 확정 라벨이 건수로 갈린다 — N=0 sync / N>0 discard-and-sync", () => {
    expect(planSyncProtectionView({ pending: 0, role: "OWNER" }).sync).toEqual({ confirmLabel: "sync", discardCount: 0 });
    expect(planSyncProtectionView({ pending: 2, role: "OWNER" }).sync).toEqual({ confirmLabel: "discard-and-sync", discardCount: 2 });
  });

  it("[C12] Home 카드 — pending > 0이면 repositoryUpdatesPaused (pending 0 → null 대조)", () => {
    expect(planSyncProtectionView({ pending: 1, role: "EDITOR" }).homeSubline).toBe("repositoryUpdatesPaused");
    expect(planSyncProtectionView({ pending: 0, role: "EDITOR" }).homeSubline).toBeNull();
  });
});
