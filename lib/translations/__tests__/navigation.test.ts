import { describe, expect, it } from "vitest";
import { planEditorNavigation, type EditorIntent } from "../navigation";

/**
 * 미저장 전환 정책 (translation-rework T3 — spec §3.5 · §3.6 · design §6).
 *
 * 다섯 전환 경로 + 뒤로/앞으로가 **같은 440 확인창**이다. 여러 키 draft를 쌓지 않으므로 대상은 현재 키의
 * 변경 로케일뿐이다. Publish는 draft를 **보존한 채** 기존 미리보기로 가고, Revert는 draft가 있으면 막힌다.
 */
const moves: EditorIntent[] = [
  { kind: "select-key", target: "k2" },
  { kind: "tree", target: "web/auth" },
  { kind: "filter" },
  { kind: "search" },
  { kind: "clear" },
  { kind: "link", target: "/projects/p/logs" },
  { kind: "history" },
  { kind: "sync" },
];

describe("planEditorNavigation — 미저장 없음", () => {
  it("모든 이동은 바로 간다", () => {
    for (const intent of [...moves, { kind: "publish" } as const, { kind: "revert" } as const]) {
      expect(planEditorNavigation({ dirtyLocales: [], saving: false, current: "k1" }, intent)).toEqual({ action: "go" });
    }
  });

  it("지금 키를 다시 고르는 것은 이동이 아니다", () => {
    expect(planEditorNavigation({ dirtyLocales: ["ko"], saving: false, current: "k1" }, { kind: "select-key", target: "k1" })).toEqual({ action: "stay" });
  });
});

describe("planEditorNavigation — 미저장 있음", () => {
  it("다섯 경로·뒤로/앞으로·Sync는 폐기 확인창을 띄우고 로케일 목록을 싣는다", () => {
    for (const intent of moves) {
      expect(planEditorNavigation({ dirtyLocales: ["ko", "ja"], saving: false, current: "k1" }, intent)).toEqual({
        action: "confirm", dialog: "discard", locales: ["ko", "ja"],
      });
    }
  });

  it("Publish는 폐기가 아니라 '저장된 것 미리보기' 확인이다 — draft를 버리지 않는다 (R2)", () => {
    expect(planEditorNavigation({ dirtyLocales: ["ko"], saving: false, current: "k1" }, { kind: "publish" })).toEqual({
      action: "confirm", dialog: "publish-unsaved", locales: ["ko"],
    });
  });

  it("Revert는 미저장이 있으면 막힌다 — Save or discard your changes first", () => {
    expect(planEditorNavigation({ dirtyLocales: ["ko"], saving: false, current: "k1" }, { kind: "revert" })).toEqual({ action: "block", reason: "unsaved" });
  });
});

describe("planEditorNavigation — 전송 중", () => {
  it("저장 중 Revert·Sync·Publish는 실행하지 않는다", () => {
    for (const kind of ["revert", "sync", "publish"] as const) {
      expect(planEditorNavigation({ dirtyLocales: [], saving: true, current: "k1" }, { kind })).toEqual({ action: "block", reason: "busy" });
    }
  });

  it("저장 중 이동은 보낸 draft가 아직 미저장이므로 확인창을 띄운다", () => {
    expect(planEditorNavigation({ dirtyLocales: ["ko"], saving: true, current: "k1" }, { kind: "select-key", target: "k2" })).toEqual({
      action: "confirm", dialog: "discard", locales: ["ko"],
    });
  });
});
