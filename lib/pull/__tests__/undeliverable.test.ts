import { describe, expect, it } from "vitest";
import { blockingErrors, splitEdits, withheldCoordinates, type RenderedSurface } from "../undeliverable";
import type { PendingEdit } from "../run";

/**
 * 전달 불가 셀의 **좌표 보류** (delivery-invariants D3). 판정 입력은 렌더 출력의 오류뿐이다 — "원본 파일이 트리에
 * 있는가"와 "그 키의 자리가 파일에 있는가"에서 나오고 값을 보지 않는다(ARCHITECTURE §0 불변식 1).
 */

const surface = (files: RenderedSurface["files"], over: Partial<RenderedSurface> = {}): RenderedSurface => ({
  surfaceId: "s1", surfaceSlug: "default", baseLocale: "en", files, ...over,
});

const edit = (id: string, localeCode: string, keyId: string, surfaceId = "s1"): PendingEdit => ({
  id, token: `tok-${id}`, cell: { surfaceId, keyId, localeCode, restoreValue: "" },
});

describe("withheldCoordinates · blockingErrors — per-locale 수술적 표면", () => {
  it("비-base fr 파일 부재 → 로케일 좌표 (s1, fr) · blocking 0", () => {
    const rendered = [surface([
      { path: "config/locales/en.yml", locale: "en", content: "en: {}\n" },
      { path: "config/locales/fr.yml", locale: "fr", content: null, errors: [{ path: "config/locales/fr.yml", code: "original-file-missing", locale: "fr" }] },
    ])];
    expect([...withheldCoordinates(rendered).locales]).toEqual(["s1\0fr"]);
    expect(blockingErrors(rendered)).toEqual([]);
  });

  it("**base** en 파일 부재 → 좌표 없음 · blocking 1 (설정 오류라 보류로 넘기지 않는다)", () => {
    const rendered = [surface([
      { path: "config/locales/en.yml", locale: "en", content: null, errors: [{ path: "config/locales/en.yml", code: "original-file-missing", locale: "en" }] },
    ])];
    const coords = withheldCoordinates(rendered);
    expect(coords.locales.size + coords.cells.size).toBe(0);
    expect(blockingErrors(rendered)).toHaveLength(1);
  });
});

describe("withheldCoordinates · blockingErrors — ts-dict", () => {
  it("write-slot-missing(fr, z) → 셀 좌표 (s1, fr, z) · blocking 0", () => {
    const rendered = [surface([
      { path: "ns/a.ts", content: "…", errors: [{ path: "ns/a.ts", code: "write-slot-missing", key: "z", locale: "fr" }] },
    ])];
    expect([...withheldCoordinates(rendered).cells]).toEqual(["s1\0fr\0z"]);
    expect(blockingErrors(rendered)).toEqual([]);
  });

  it("write-locale-object-missing → blocking 1 (로케일 전체로 번지므로 셀 단위가 아니다)", () => {
    const rendered = [surface([
      { path: "ns/a.ts", content: "…", errors: [{ path: "ns/a.ts", code: "write-locale-object-missing", key: "fr", locale: "fr" }] },
    ])];
    expect(blockingErrors(rendered)).toHaveLength(1);
    expect(withheldCoordinates(rendered).cells.size).toBe(0);
  });

  it("multi-locale 원본 부재는 blocking이다 — 로케일이 없는 파일 오류다", () => {
    const rendered = [surface([
      { path: "ns/a.ts", content: null, errors: [{ path: "ns/a.ts", code: "original-file-missing" }] },
    ])];
    expect(blockingErrors(rendered)).toHaveLength(1);
  });
});

describe("blockingErrors — 그 밖의 writer 경고는 그대로 reject다", () => {
  it("json-catalog 접두 충돌 → blocking 1 · 표면 slug가 붙는다", () => {
    const rendered = [surface([
      { path: "i18n/en.json", locale: "en", content: "{}", errors: [{ path: "i18n/en.json", code: "key-prefix-conflict", key: "a.b", locale: "en" }] },
    ], { surfaceSlug: "web" })];
    expect(blockingErrors(rendered)).toEqual([{ surfaceSlug: "web", error: expect.objectContaining({ code: "key-prefix-conflict" }) }]);
  });
});

describe("splitEdits — 캡처 편집을 실린 것/보류된 것으로 가른다", () => {
  const keyOf = (keyId: string) => ({ k1: "a", k2: "z" } as Record<string, string>)[keyId];

  it("로케일 좌표 안 편집 → withheld · 밖 → delivered (N > 0 짝)", () => {
    const withheld = { locales: new Set(["s1\0fr"]), cells: new Set<string>() };
    const out = splitEdits([edit("e1", "ko", "k1"), edit("e2", "fr", "k1")], withheld, keyOf);
    expect(out.delivered.map(e => e.id)).toEqual(["e1"]);
    expect(out.withheld.map(e => e.id)).toEqual(["e2"]);
    expect(out.withheldBy).toEqual({ file: 1, key: 0 });
  });

  it("셀 좌표 안 편집 → withheld (key 사유) · 같은 로케일 다른 키 → delivered", () => {
    const withheld = { locales: new Set<string>(), cells: new Set(["s1\0fr\0z"]) };
    const out = splitEdits([edit("e1", "fr", "k1"), edit("e2", "fr", "k2")], withheld, keyOf);
    expect(out.delivered.map(e => e.id)).toEqual(["e1"]);
    expect(out.withheld.map(e => e.id)).toEqual(["e2"]);
    expect(out.withheldBy).toEqual({ file: 0, key: 1 });
  });

  it("다른 표면의 같은 로케일은 좌표 밖이다", () => {
    const withheld = { locales: new Set(["s1\0fr"]), cells: new Set<string>() };
    const out = splitEdits([edit("e1", "fr", "k1", "s2")], withheld, keyOf);
    expect(out.delivered).toHaveLength(1);
  });

  it("좌표가 있을 때 `cell` 없는 편집은 보수적으로 보류한다 — 좌표 밖임을 증명할 수 없다", () => {
    const withheld = { locales: new Set(["s1\0fr"]), cells: new Set<string>() };
    const out = splitEdits([{ id: "e1", token: "t" }, edit("e2", "ko", "k1")], withheld, keyOf);
    expect(out.withheld.map(e => e.id)).toEqual(["e1"]);
    expect(out.delivered.map(e => e.id)).toEqual(["e2"]);
  });

  it("좌표가 없으면 `cell` 없는 편집도 전부 delivered다 (보류할 것이 없다)", () => {
    const out = splitEdits([{ id: "e1", token: "t" }], { locales: new Set(), cells: new Set() }, keyOf);
    expect(out.delivered).toHaveLength(1);
    expect(out.withheld).toHaveLength(0);
  });
});
