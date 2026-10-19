import { describe, expect, it } from "vitest";
import { appleXcstrings } from "@/lib/adapters/apple-xcstrings";
import { tsDict } from "@/lib/adapters/ts-dict";
import type { DetectedFormat } from "@/lib/adapters/types";
import { renderLocaleFiles, type RenderKey } from "../render";
import { planDelivery, projectFormats, type PendingEdit, type PullState } from "../run";
import { blockingErrors, cellSlot, keySlot, readSlotFiles, slotlessCells, withheldCoordinates, type SlotFiles } from "../undeliverable";

/**
 * **셀 삽입 가능 판정** (apple-strings design §2.3 — 2026-10-19 사용자, Codex 피어 검수). `.xcstrings` writer는 파일에 있는 키의 **없는 언어 셀**을 넣는다.
 * 경로 선택(`planDelivery`)·미리보기(`readPublishPreview`)가 ts-dict처럼 그 셀을 보류로 세면 PR에는 셀이 나가는데 화면은 "보류"를 말하고 미전달 토큰이
 * 남는다. 그래서 두 판정이 같은 `cellSlot`을 지난다. ts-dict의 보류는 그대로다. 미리보기·토큰 해제까지 잇는 시나리오는 격리 Postgres
 * (`apple-xcstrings-publish.integration.ts`)가 든다.
 */

const PATH = "App/Localizable.xcstrings";
const cell = (value: string) => ({ stringUnit: { state: "translated", value } });
/** `fr`은 `Hello`에만 있고 `Bye`에는 없다 — `Bye.fr`이 삽입 대상이다. */
const SOURCE = JSON.stringify({
  sourceLanguage: "en",
  strings: { Bye: { localizations: { en: cell("Goodbye") } }, Hello: { localizations: { en: cell("Hello"), fr: cell("Bonjour") } } },
  version: "1.0",
}, null, 2).replace(/": /g, '" : ');
const format: DetectedFormat = { adapter: "apple-xcstrings", pathTemplate: PATH, locales: ["en", "fr"] };

describe("cellSlot — 미리보기와 실행이 같이 부르는 판정", () => {
  const files: SlotFiles = readSlotFiles(appleXcstrings, format, [{ path: PATH, content: SOURCE }]);

  it("xcstrings: 키가 든 파일이면 그 언어 셀이 없어도 자리다 — 없는 언어 코드여도 같다", () => {
    expect(cellSlot(appleXcstrings, files, "fr", "Bye")).toEqual({ kind: "slot", paths: [PATH] });
    expect(cellSlot(appleXcstrings, files, "fr", "Hello")).toEqual({ kind: "slot", paths: [PATH] });
    expect(cellSlot(appleXcstrings, files, "de", "Bye")).toEqual({ kind: "slot", paths: [PATH] });
  });

  it("xcstrings: 파일에 없는 키(코드가 지웠다)는 absent — 보류다", () => {
    expect(cellSlot(appleXcstrings, files, "fr", "Gone")).toEqual({ kind: "absent" });
    expect(cellSlot(appleXcstrings, files, "fr", "constructor")).toEqual({ kind: "absent" });
  });

  it("ts-dict는 keySlot 그대로다 — 로케일 객체에 자리가 없으면 absent", () => {
    const ts: SlotFiles = { "ns/a.ts": { en: { hello: "Hi", bye: "Bye" }, fr: { hello: "Salut" } } };
    expect(cellSlot(tsDict, ts, "fr", "bye")).toEqual(keySlot(ts, "fr", "bye"));
    expect(cellSlot(tsDict, ts, "fr", "bye")).toEqual({ kind: "absent" });
    expect(cellSlot(tsDict, ts, "de", "hello")).toEqual({ kind: "no-locale" });
  });

  it("slotlessCells도 같은 판정이다 — xcstrings의 Bye.fr은 좌표가 아니고 ts-dict의 같은 모양은 좌표다", () => {
    const edit = (id: string, localeCode: string, keyId: string): PendingEdit => ({ id, token: `t-${id}`, cell: { surfaceId: "s", keyId, localeCode, restoreValue: "" } });
    const keys: Record<string, string> = { b: "Bye", g: "Gone" };
    expect(slotlessCells(appleXcstrings, "s", files, [edit("1", "fr", "b"), edit("2", "fr", "g")], (id) => keys[id])).toEqual(["s\0fr\0Gone"]);
    const ts: SlotFiles = { "ns/a.ts": { en: { Bye: "Bye" }, fr: {} } };
    expect(slotlessCells(tsDict, "s", ts, [edit("1", "fr", "b")], (id) => keys[id])).toEqual(["s\0fr\0Bye"]);
  });
});

describe("planDelivery · 렌더 — 같은 셀을 같은 쪽으로 센다", () => {
  const keys = (frBye: string | undefined, frHello = "Bonjour"): RenderKey[] => [
    { id: "kb", key: "Bye", sourceText: "Goodbye", orphaned: false, cells: { en: { value: "Goodbye" }, ...(frBye === undefined ? {} : { fr: { value: frBye } }) } },
    { id: "kh", key: "Hello", sourceText: "Hello", orphaned: false, cells: { en: { value: "Hello" }, fr: { value: frHello } } },
    { id: "kg", key: "Gone", sourceText: "Gone", orphaned: false, cells: { en: { value: "Gone" }, fr: { value: "Parti" } } },
  ];
  const state = (frBye: string | undefined, frHello?: string) => {
    const surfaces: PullState["surfaces"] = [{ id: "s", slug: "app", adapterName: "apple-xcstrings", pathTemplate: PATH, baseLocale: "en", basePath: null,
      nested: null, nestedByPath: {}, localeCodes: ["en", "fr"], keys: keys(frBye, frHello) }];
    const resolved = projectFormats(surfaces).map((item) => ({ ...item, paths: [{ path: PATH }] }));
    const current = new Map([[PATH, SOURCE]]);
    const rendered = [{ surfaceId: "s", surfaceSlug: "app", baseLocale: "en", files: renderLocaleFiles(format, "multi-locale", [{ path: PATH }], keys(frBye, frHello), "en", current) }];
    return { resolved, current, rendered };
  };
  const edit = (keyId: string, localeCode: string): PendingEdit => ({ id: `${keyId}-${localeCode}`, token: `t-${keyId}`, cell: { surfaceId: "s", keyId, localeCode, restoreValue: "" } });

  it("Bye.fr(셀 없음)은 전달이고 렌더가 그 셀을 넣는다 · Gone.fr(키 없음)은 보류이고 렌더가 쓰지 않는다", () => {
    const input = state("Au revoir");
    const { split, warnings } = planDelivery([edit("kb", "fr"), edit("kg", "fr")], input);
    expect(warnings).toEqual([]);
    expect(split.delivered.map((e) => e.id)).toEqual(["kb-fr"]);
    expect(split.withheld.map((e) => e.id)).toEqual(["kg-fr"]);
    expect(split.withheldBy).toMatchObject({ key: 1, file: 0 });
    const out = input.rendered[0]!.files[0]!;
    expect(out.errors ?? []).toEqual([]);
    expect(JSON.parse(out.content!).strings.Bye.localizations.fr).toEqual(cell("Au revoir"));
    expect(out.content).not.toContain("Parti");
    expect(blockingErrors(input.rendered)).toEqual([]);
    expect(withheldCoordinates(input.rendered).cells.size).toBe(0);
  });

  it("빈 값 경고는 실제로 있는 셀만이다 — 넣은 적 없는 셀을 비운 편집은 비울 것이 없다", () => {
    expect(planDelivery([edit("kb", "fr")], state("")).warnings).toEqual([]);
    expect(planDelivery([edit("kh", "fr")], state(undefined, "")).warnings).toEqual([{ surfaceSlug: "app", path: PATH, key: "Hello", code: "write-empty-unsupported" }]);
  });
});
