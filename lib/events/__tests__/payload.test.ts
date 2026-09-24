import { describe, expect, it } from "vitest";

import { EVENT_KINDS, readPayload } from "../payload";

/**
 * 저장된 Json → 종류별 맥락 (audit #74 — 테스트 없는 순수 export였다). **읽는 쪽이 폴백을 든다** —
 * 옛 행·다른 버전이 쓴 payload가 와도 화면이 죽지 않고 `Not recorded`로 떨어져야 한다.
 *
 * "폴백으로 떨어진다"는 단언마다 같은 갈래의 정상 입력이 값을 돌려주는 짝을 둔다 (POSTMORTEM 2026-09-14) —
 * 전부 null을 돌려주는 구현도 폴백 단언만으로는 통과한다.
 */

describe("readPayload — 객체가 아닌 값", () => {
  it.each([null, undefined, "x", 1, true, [], [{ key: "a" }]])("%j는 어느 종류에서도 null이다", (value) => {
    for (const kind of EVENT_KINDS) expect(readPayload(kind, value)).toBeNull();
  });
});

describe("readPayload — 정상 payload는 그대로 읽힌다", () => {
  it("TRANSLATION", () => {
    expect(readPayload("TRANSLATION", { surfaceSlug: "web", key: "a.b", locale: "ko", before: "옛", after: "새" }))
      .toEqual({ kind: "TRANSLATION", surfaceSlug: "web", key: "a.b", locale: "ko", before: "옛", after: "새" });
  });

  it("IMPORT — 소스별 결과까지", () => {
    expect(readPayload("IMPORT", {
      source: "manual",
      surfaceSlugs: ["web", "app"],
      keys: 12,
      pendingEdits: 0,
      surfaces: [{ surfaceSlug: "web", status: "partial", count: 3, reason: "read-errors" }],
      errorCode: "import-failed",
      refusal: "stale-commit",
    })).toEqual({
      kind: "IMPORT",
      source: "manual",
      surfaceSlugs: ["web", "app"],
      keys: 12,
      pendingEdits: 0,
      surfaces: [{ surfaceSlug: "web", status: "partial", count: 3, reason: "read-errors" }],
      errorCode: "import-failed",
      refusal: "stale-commit",
    });
  });

  it("PUBLISH · SURFACE · MEMBER · SETTINGS", () => {
    expect(readPayload("PUBLISH", { surfaceSlugs: ["web"], refusal: "archived" })).toEqual({ kind: "PUBLISH", surfaceSlugs: ["web"], refusal: "archived" });
    expect(readPayload("SURFACE", { surfaceSlug: "web", adapter: "json-catalog", baseLocale: { before: "en", after: "ko" } }))
      .toEqual({ kind: "SURFACE", surfaceSlug: "web", adapter: "json-catalog", baseLocale: { before: "en", after: "ko" } });
    expect(readPayload("MEMBER", { targetLabel: "j***@e***.com", role: { before: "EDITOR", after: "OWNER" } }))
      .toEqual({ kind: "MEMBER", targetLabel: "j***@e***.com", role: { before: "EDITOR", after: "OWNER" } });
    expect(readPayload("SETTINGS", { field: "name", value: { before: "A", after: "B" } }))
      .toEqual({ kind: "SETTINGS", field: "name", value: { before: "A", after: "B" } });
  });
});

describe("readPayload — 빠지거나 모양이 틀린 필드는 폴백이다", () => {
  it("TRANSLATION — 문자열 자리는 빈 문자열, 값 자리는 null", () => {
    expect(readPayload("TRANSLATION", { key: 1, before: 2 }))
      .toEqual({ kind: "TRANSLATION", surfaceSlug: "", key: "", locale: "", before: null, after: null });
  });

  it("IMPORT — 모르는 source는 ci, 모르는 refusal은 null, 유한하지 않은 수는 null", () => {
    expect(readPayload("IMPORT", {
      source: "cron",
      surfaceSlugs: ["web", 3, null, "app"],
      keys: Number.NaN,
      pendingEdits: "3",
      errorCode: 7,
      refusal: "too-soon",
    })).toEqual({
      kind: "IMPORT",
      source: "ci",
      surfaceSlugs: ["web", "app"],
      keys: null,
      pendingEdits: null,
      surfaces: [],
      errorCode: null,
      refusal: null,
    });
    expect(readPayload("IMPORT", { keys: Number.POSITIVE_INFINITY, surfaceSlugs: "web" })).toMatchObject({ keys: null, surfaceSlugs: [] });
  });

  it("IMPORT — 소스별 결과는 status가 알려진 항목만 남기고, 나머지 필드는 null로 채운다", () => {
    const got = readPayload("IMPORT", {
      surfaces: [
        null,
        "web",
        [],
        { surfaceSlug: "web", status: "unknown" },
        { surfaceSlug: "app", status: "superseded" },
        { status: "failed", count: "3", reason: 1 },
      ],
    });
    expect(got).toMatchObject({
      surfaces: [
        { surfaceSlug: "app", status: "superseded", count: null, reason: null },
        { surfaceSlug: "", status: "failed", count: null, reason: null },
      ],
    });
    expect(readPayload("IMPORT", { surfaces: { surfaceSlug: "web", status: "imported" } })).toMatchObject({ surfaces: [] });
  });

  it("전후 값 — 객체가 아니면 null, 안쪽 필드가 틀리면 그 칸만 null", () => {
    expect(readPayload("SURFACE", { surfaceSlug: "web", baseLocale: "ko" })).toMatchObject({ adapter: null, baseLocale: null });
    expect(readPayload("MEMBER", { role: ["EDITOR", "OWNER"] })).toEqual({ kind: "MEMBER", targetLabel: "", role: null });
    expect(readPayload("SETTINGS", { field: "name", value: { before: 1, after: "B" } }))
      .toEqual({ kind: "SETTINGS", field: "name", value: { before: null, after: "B" } });
    expect(readPayload("SETTINGS", {})).toEqual({ kind: "SETTINGS", field: "", value: null });
  });
});

/**
 * ⚠️ **`Object.hasOwn`으로 읽는다** (POSTMORTEM 2026-09-08). `raw[key] ?? fallback`이면 `Object.prototype`의
 * 함수가 문자열 자리에 온다 — 번역 키·로케일이 이 안에 들어가므로 남이 정한 키가 실제로 닿는 자리다.
 */
describe("readPayload — 프로토타입에서 찾아진 값을 읽지 않는다", () => {
  it("상속된 필드는 없는 필드와 같다", () => {
    const inherited = Object.create({ key: "from-prototype", locale: "ko", surfaces: [{ surfaceSlug: "x", status: "imported" }] }) as object;
    expect(readPayload("TRANSLATION", inherited)).toMatchObject({ key: "", locale: "" });
    expect(readPayload("IMPORT", inherited)).toMatchObject({ surfaces: [] });
    // 짝: 같은 값이 own이면 읽힌다.
    expect(readPayload("TRANSLATION", { key: "own", locale: "ko" })).toMatchObject({ key: "own", locale: "ko" });
  });

  it("Object.prototype의 이름을 가진 값도 목록 판정을 통과하지 않는다", () => {
    expect(readPayload("IMPORT", { source: "toString", refusal: "constructor", surfaces: [{ status: "hasOwnProperty" }] }))
      .toMatchObject({ source: "ci", refusal: null, surfaces: [] });
  });
});
