import { describe, expect, it } from "vitest";

import { observedLocalesOf } from "@/lib/pull/locales";
import { projectFormats } from "@/lib/pull/run";

import { observeSurfaceLocales } from "../observe";

/**
 * **base 트리에서 본 소스의 로케일** (locale-add design §1 "존재 판정은 같은 함수"). 같은 SHA라 적재를 건너뛰는 야간 방문과 야간 적재의 만료가 넘기는
 * 관측이다. Publish 스냅샷 전 만료(`observedLocalesOf`, B2)와 **같은 함수**여야 한다 — 같은 트리에서 둘이 다른 존재를 말하면, 한쪽 만료가 활성으로
 * 돌린 언어를 다른 쪽이 orphan으로 돌린다(R-B2 Y4). 의미는 어댑터 읽기(`localeFromPath`) + 정규 파일(100644·100755)이다.
 */
describe("observeSurfaceLocales", () => {
  const file = (path: string, mode = "100644") => ({ path, sha: path, mode });
  const tree = [
    file("i18n/en.json"), file("i18n/ko.json", "100755"), file("i18n/README.md"), file("other/fr.json"),
    file("_locales/en/messages.json"), file("_locales/ko/notes.txt"), file("_locales/ja/messages.json"),
  ];

  it("json-catalog — 템플릿에 맞는 정규 파일의 로케일만, 코드순", () => {
    expect(observeSurfaceLocales(tree, { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" })).toEqual({ status: "observed", locales: ["en", "ko"] });
  });

  it("chrome-locales — 같은 디렉터리의 다른 파일은 로케일 증거가 아니다", () => {
    expect(observeSurfaceLocales(tree, { adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json" })).toEqual({ status: "observed", locales: ["en", "ja"] });
  });

  it("링크된 로케일 파일(120000)·하위 모듈(160000)은 관측이 아니다", () => {
    const linked = [file("i18n/en.json"), file("i18n/ko.json", "120000"), file("i18n/fr.json", "160000")];
    expect(observeSurfaceLocales(linked, { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" })).toEqual({ status: "observed", locales: ["en"] });
  });

  it("어댑터가 읽지 못하는 코드(`es_419`)는 관측이 아니다", () => {
    expect(observeSurfaceLocales([file("i18n/en.json"), file("i18n/es_419.json")], { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" }))
      .toEqual({ status: "observed", locales: ["en"] });
  });

  it("⚠️ 템플릿에 맞는 경로의 mode를 모르면 관측할 수 없다 — 정규 파일로 가정하지 않는다(fail-closed)", () => {
    expect(observeSurfaceLocales([{ path: "i18n/en.json" }], { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" })).toEqual({ status: "unreadable" });
    // 템플릿 밖 경로의 mode는 판정에 들지 않는다.
    expect(observeSurfaceLocales([file("i18n/en.json"), { path: "docs/x.md" }], { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" }))
      .toEqual({ status: "observed", locales: ["en"] });
  });

  it("맞는 파일이 없으면 빈 관측이다 — 만료 판정이 base-empty로 보류한다", () => {
    expect(observeSurfaceLocales([], { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" })).toEqual({ status: "observed", locales: [] });
  });

  it.each([
    ["언어 변경을 받지 않는 어댑터", { adapterName: "ts-dict", pathTemplate: "src/i18n.ts" }],
    ["모르는 어댑터", { adapterName: "nope", pathTemplate: "i18n/{locale}.json" }],
    ["포맷 미정", { adapterName: null, pathTemplate: null }],
  ])("%s → unreadable", (_name, surface) => {
    expect(observeSurfaceLocales(tree, surface)).toEqual({ status: "unreadable" });
  });

  it("Publish 스냅샷 전 만료(`observedLocalesOf`)와 같은 트리에서 같은 존재를 말한다 — 링크·`es_419`·실행 비트 포함", () => {
    const base = [file("i18n/en.json"), file("i18n/ko.json", "100755"), file("i18n/ja.json", "120000"), file("i18n/es_419.json"), file("i18n/nested/fr.json"), file("other/de.json")];
    const surface = { id: "s1", slug: "default", archivedAt: null, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en",
      lastPulledAt: null, localeCodes: ["en", "ko", "ja"], keys: [] };
    const [item] = projectFormats([{ ...surface, id: "s1" }] as unknown as Parameters<typeof projectFormats>[0]);
    if (item === undefined) throw new Error("no format");
    expect(observeSurfaceLocales(base, surface)).toEqual(observedLocalesOf(item, base));
    expect(observeSurfaceLocales(base, surface)).toEqual({ status: "observed", locales: ["en", "ko"] });
  });
});
