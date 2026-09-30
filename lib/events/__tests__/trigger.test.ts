import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { EVENT_KINDS, NIGHTLY_SUBTYPES, readPayload } from "../payload";
import { eventGlyph, eventView, triggerOf } from "../view";

/**
 * 주체 판정 (nightly-sync design `triggerOf`). **`subtype` 컬럼만 본다** — `payload.source`는 옛 행에서 비어 있고,
 * 읽는 쪽 폴백(`readPayload`의 `?? "ci"`)이 야간 행을 CI로 읽는 함정이 판정에서 빠진다.
 */
describe("triggerOf — 주체 셋", () => {
  it.each([
    ["IMPORT", "USER", "import.run", "manual"],
    ["IMPORT", "USER", "import.first", "manual"],
    ["IMPORT", "AUTOMATION", "import.ci", "ci"],
    ["IMPORT", "AUTOMATION", "import.nightly", "nightly"],
    ["IMPORT", "AUTOMATION", "nightly.skip", "nightly"],
    ["PUBLISH", "AUTOMATION", "publish.run", "nightly"],
    ["PUBLISH", "AUTOMATION", "publish.notStarted", "nightly"],
    ["PUBLISH", "USER", "publish.run", "manual"],
  ] as const)("%s × %s × %s → %s", (kind, actorKind, subtype, expected) => {
    expect(triggerOf({ kind, actorKind, subtype })).toBe(expected);
  });

  it("USER는 종류·subtype과 무관하게 manual이다(MCP 포함) — 야간 subtype을 써도", () => {
    for (const kind of EVENT_KINDS) {
      expect(triggerOf({ kind, actorKind: "USER", subtype: "x" }), kind).toBe("manual");
      expect(triggerOf({ kind, actorKind: "USER", subtype: "import.nightly" }), kind).toBe("manual");
    }
  });

  it("그 밖의 AUTOMATION(생산자 0곳인 reported-failure 포함)은 ci다", () => {
    expect(triggerOf({ kind: "IMPORT", actorKind: "AUTOMATION", subtype: "import.reportedFailure" })).toBe("ci");
  });

  it("야간 subtype 목록은 둘이다", () => {
    expect([...NIGHTLY_SUBTYPES].sort()).toEqual(["import.nightly", "nightly.skip"]);
  });
});

describe("readPayload — 야간 source는 ci로 폴백하지 않는다", () => {
  it("source nightly → nightly", () => {
    expect(readPayload("IMPORT", { source: "nightly" })).toMatchObject({ source: "nightly" });
  });

  it("deferReason 넷을 읽는다", () => {
    for (const reason of ["pending-edits", "open-pr", "pr-check-failed", "too-large"]) {
      expect(readPayload("IMPORT", { source: "ci", deferReason: reason }), reason).toMatchObject({ deferReason: reason });
    }
  });

  it("changedValues를 읽는다 — 0은 0이다", () => {
    expect(readPayload("IMPORT", { changedValues: 0 })).toMatchObject({ changedValues: 0 });
    expect(readPayload("IMPORT", { changedValues: 12 })).toMatchObject({ changedValues: 12 });
  });

  it("없거나 모르는 값은 null이다 — 옛 행은 `—`로 읽힌다", () => {
    expect(readPayload("IMPORT", { source: "ci" })).toMatchObject({ deferReason: null, changedValues: null });
    expect(readPayload("IMPORT", { deferReason: "later", changedValues: "3" })).toMatchObject({ deferReason: null, changedValues: null });
    expect(readPayload("IMPORT", { deferReason: "constructor" })).toMatchObject({ deferReason: null });
  });
});

describe("upToDate — 새 결과어", () => {
  it("nothingToSend와 다른 라벨이다", () => {
    const upToDate = eventView({ kind: "IMPORT", result: "upToDate", warnings: 0, errorCode: null }).label;
    const nothing = eventView({ kind: "PUBLISH", result: "nothingToSend", warnings: 0, errorCode: null }).label;
    expect(upToDate).toBe(m.logs.status.upToDate);
    expect(upToDate).not.toBe(nothing);
  });

  it("muted · slate — 보낼 것도 받을 것도 없던 밤은 성공도 경고도 아니다", () => {
    expect(eventView({ kind: "IMPORT", result: "upToDate", warnings: 0, errorCode: null }).tone).toBe("muted");
    expect(eventGlyph({ kind: "IMPORT", result: "upToDate", subtype: "nightly.skip" }).tone).toBe("slate");
  });
});
