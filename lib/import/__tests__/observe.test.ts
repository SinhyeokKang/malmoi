import { describe, expect, it } from "vitest";

import { observeSurfaceLocales } from "../observe";

/**
 * **base 트리에서 본 소스의 로케일** (locale-add design §1 "만료와 strict 적재"). 같은 SHA라 적재를 건너뛰는 야간 방문이 만료 판정에 넘기는
 * 관측이다. strict 적재의 `payload.locales`와 같은 뜻이어야 한다 — 경로 → 로케일 판정은 적재가 쓰는 `templatePaths`·`localeOfTemplatePath`
 * 한 벌이다(`localesToKeep`). 관측할 수 없는 소스는 `unreadable`이고 파일 부재로 읽지 않는다(POSTMORTEM 2026-09-27).
 */
describe("observeSurfaceLocales", () => {
  const paths = ["i18n/en.json", "i18n/ko.json", "i18n/README.md", "other/fr.json", "_locales/en/messages.json", "_locales/ko/notes.txt", "_locales/ja/messages.json"];

  it("json-catalog — 템플릿에 맞는 경로의 로케일만, 코드순", () => {
    expect(observeSurfaceLocales(paths, { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" })).toEqual({ status: "observed", locales: ["en", "ko"] });
  });

  it("chrome-locales — 같은 디렉터리의 다른 파일은 로케일 증거가 아니다", () => {
    expect(observeSurfaceLocales(paths, { adapterName: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json" })).toEqual({ status: "observed", locales: ["en", "ja"] });
  });

  it("맞는 파일이 없으면 빈 관측이다 — 만료 판정이 base-empty로 보류한다", () => {
    expect(observeSurfaceLocales([], { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" })).toEqual({ status: "observed", locales: [] });
  });

  it.each([
    ["다중 로케일 어댑터(경로가 로케일을 말하지 않는다)", { adapterName: "ts-dict", pathTemplate: "src/i18n.ts" }],
    ["모르는 어댑터", { adapterName: "nope", pathTemplate: "i18n/{locale}.json" }],
    ["포맷 미정", { adapterName: null, pathTemplate: null }],
  ])("%s → unreadable", (_name, surface) => {
    expect(observeSurfaceLocales(paths, surface)).toEqual({ status: "unreadable" });
  });
});
