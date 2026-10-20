import { describe, expect, it } from "vitest";
import { blockingErrors, keySlot, readSlotFiles, slotlessCells, splitEdits, withheldCoordinates, type RenderedSurface, type SlotFiles } from "../undeliverable";
import { tsDict } from "@/lib/adapters/ts-dict";
import type { DetectedFormat } from "@/lib/adapters/types";
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

/**
 * Android 비기준 파일의 쓸 수 없는 자리(리소스 참조·`translatable="false"`) — 셀 보류다(audit 2026-10-20 리뷰 Y1 · 사용자 결정 D9). 편집이 아닌 옛 DB 값은
 * 토큰이 없어 아무 효과가 없고, 편집은 토큰을 남긴 채 그 셀만 빠진다. 같은 이름 둘(`key-shadowed` — aapt2 빌드 오류)은 프로젝트 차단 그대로다.
 * 다른 어댑터(code-dict)의 같은 코드와 기준 파일은 바뀌지 않는다 — 표면의 어댑터가 판정 입력이다.
 */
describe("withheldCoordinates · blockingErrors — android-strings 비기준 파일", () => {
  const ko = (errors: NonNullable<RenderedSurface["files"][number]["errors"]>) =>
    ({ path: "app/res/values-ko/strings.xml", locale: "ko", content: "<resources/>", errors });
  const unwritable = { path: "app/res/values-ko/strings.xml", code: "write-slot-not-string-literal" as const, key: "title", detail: "resource reference" };

  it("write-slot-not-string-literal(ko, title) → 셀 좌표 (s1, ko, title) · blocking 0", () => {
    const rendered = [surface([ko([unwritable])], { adapter: "android-strings" })];
    expect([...withheldCoordinates(rendered).cells]).toEqual(["s1\0ko\0title"]);
    expect(blockingErrors(rendered)).toEqual([]);
  });

  it("key-shadowed(같은 이름 둘)는 blocking 그대로다", () => {
    const rendered = [surface([ko([{ path: unwritable.path, code: "key-shadowed", key: "title" }])], { adapter: "android-strings" })];
    expect(withheldCoordinates(rendered).cells.size).toBe(0);
    expect(blockingErrors(rendered)).toHaveLength(1);
  });

  it("기준 언어 파일·키 없는 오류·다른 어댑터(code-dict)·어댑터를 모르는 표면은 blocking 그대로다", () => {
    const base = { path: "app/res/values/strings.xml", locale: "en", content: "<resources/>", errors: [{ ...unwritable, path: "app/res/values/strings.xml" }] };
    const { key: _, ...keyless } = unwritable;
    for (const rendered of [
      [surface([base], { adapter: "android-strings" })],
      [surface([ko([keyless])], { adapter: "android-strings" })],
      [surface([ko([unwritable])], { adapter: "code-dict" })],
      [surface([ko([unwritable])])],
    ]) {
      expect(withheldCoordinates(rendered).cells.size).toBe(0);
      expect(blockingErrors(rendered)).toHaveLength(1);
    }
  });
});

describe("blockingErrors — 그 밖의 writer 경고는 그대로 reject다", () => {
  it("per-locale(code-dict)의 write-slot-missing은 blocking이다 — 구조상 삽입 포기라 셀 보류 대상이 아니다 (C는 ts-dict만)", () => {
    const rendered = [surface([
      { path: "i18n/ko.ts", locale: "ko", content: "…", errors: [{ path: "i18n/ko.ts", code: "write-slot-missing", key: "a.b", locale: "ko" }] },
    ])];
    expect(blockingErrors(rendered)).toHaveLength(1);
    expect(withheldCoordinates(rendered).cells.size).toBe(0);
  });

  it("json-catalog 접두 충돌 → blocking 1 · 표면 slug가 붙는다", () => {
    const rendered = [surface([
      { path: "i18n/en.json", locale: "en", content: "{}", errors: [{ path: "i18n/en.json", code: "key-shadowed", key: "a.b", locale: "en" }] },
    ], { surfaceSlug: "web" })];
    expect(blockingErrors(rendered)).toEqual([{ surfaceSlug: "web", error: expect.objectContaining({ code: "key-shadowed" }) }]);
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

  /**
   * 언어 변경이 뺀 언어(보류된 ADD 등 — `ProjectLocalePlan.exclude`)의 편집은 파일 보류에 들되 따로 센다(R-E3 Y1). 화면이 그 수를 "파일이 아직 없다"
   * 문장에서 빼고 Held 행이 이유를 말한다. 파일 보류 수 자체(`file`)는 그대로라 `SyncRun.withheld`·MCP 수가 바뀌지 않는다.
   */
  it("언어 변경이 뺀 언어의 편집은 file에 들고 language로도 센다", () => {
    const withheld = { locales: new Set(["s1\0fr", "s1\0de"]), cells: new Set<string>(), languages: new Set(["s1\0fr"]) };
    const out = splitEdits([edit("e1", "ko", "k1"), edit("e2", "fr", "k1"), edit("e3", "de", "k1")], withheld, keyOf);
    expect(out.withheld.map(e => e.id)).toEqual(["e2", "e3"]);
    expect(out.withheldBy).toEqual({ file: 2, key: 0, language: 1 });
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

describe("keySlot · slotlessCells — ts-dict 키 자리 (audit #1 B)", () => {
  const files: SlotFiles = {
    "ns/a.ts": { en: { hello: "Hi" }, fr: { hello: "Salut" } },
    "ns/b.ts": { en: { bye: "Bye" }, fr: {} },
  };

  it("자리가 있으면 그 파일들 · 로케일 객체는 있는데 키가 어디에도 없으면 absent · 로케일 객체가 없으면 no-locale", () => {
    expect(keySlot(files, "fr", "hello")).toEqual({ kind: "slot", paths: ["ns/a.ts"] });
    expect(keySlot(files, "fr", "gone")).toEqual({ kind: "absent" });
    expect(keySlot(files, "de", "hello")).toEqual({ kind: "no-locale" });
  });

  it("프로토타입 키는 자리가 아니다", () => {
    expect(keySlot(files, "fr", "constructor")).toEqual({ kind: "absent" });
    expect(keySlot(files, "toString", "hello")).toEqual({ kind: "no-locale" });
  });

  it("absent 셀만 좌표로 낸다 — 다른 표면·좌표 없는 편집·no-locale은 제외", () => {
    const keys: Record<string, string> = { k1: "hello", k2: "gone", k3: "bye" };
    const edits = [edit("1", "fr", "k1"), edit("2", "fr", "k2"), edit("3", "fr", "k3"), edit("4", "de", "k2"), edit("5", "fr", "k2", "s2"),
      { id: "6", token: "t6" }];
    expect(slotlessCells(tsDict, "s1", files, edits, (id) => keys[id])).toEqual(["s1\0fr\0gone", "s1\0fr\0bye"]);
  });

  it("readSlotFiles는 파일마다 읽는다 — 로케일이 파일 사이에 섞이지 않는다", () => {
    const format: DetectedFormat = { adapter: "ts-dict", pathTemplate: "*.ts", locales: ["en", "fr"] };
    const read = readSlotFiles(tsDict, format, [
      { path: "a.ts", content: 'const en = { hello: "Hi" };\nconst fr = {};\n' },
      { path: "b.ts", content: 'const en = { bye: "Bye" };\nconst fr = { bye: "Salut" };\n' },
    ]);
    expect(keySlot(read, "fr", "hello")).toEqual({ kind: "absent" });
    expect(keySlot(read, "fr", "bye")).toEqual({ kind: "slot", paths: ["b.ts"] });
  });
});
