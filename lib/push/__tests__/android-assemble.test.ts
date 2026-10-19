import { describe, expect, it } from "vitest";

import { detectFormat } from "@/lib/adapters";

import { assemblePushInput } from "../assemble";

/**
 * `assemblePushInput`의 basePath 갈래 (android-strings design §2.3·§2.4). `values/strings.xml`에는 코드가 없다 — 기준 언어 코드는 호출부가 정해
 * `--base`(CLI)·온보딩 입력으로 넘기고, 포맷의 언어 목록에 더하는 것도 호출부다(T3.2b). 여기는 그 코드로 기준 파일을 읽는 공용 깔때기다.
 */
const TREE: Record<string, string> = {
  "app/src/main/res/values/strings.xml": '<resources>\n    <string name="title">Home</string>\n</resources>\n',
  "app/src/main/res/values-ko/strings.xml": '<resources>\n    <string name="title">홈</string>\n</resources>\n',
};
const paths = Object.keys(TREE);
const probe = (p: string) => TREE[p];

describe("assemblePushInput — basePath 표면", () => {
  const detected = detectFormat(paths, probe)!;

  it("탐지는 기준 언어 코드를 모른다 — 언어 목록에 없다", () => {
    expect(detected).toEqual({ adapter: "android-strings", pathTemplate: "app/src/main/res/values-{locale}/strings.xml", basePath: "app/src/main/res/values/strings.xml", locales: ["ko"] });
  });

  it("호출부가 코드를 더하면 basePath 파일을 그 언어로 읽는다", () => {
    const out = assemblePushInput({ paths, probe, format: { ...detected, locales: [...detected.locales, "en"] }, baseLocale: "en" });
    expect(out.baseLocale).toBe("en");
    expect(out.files.map((f) => f.path).sort()).toEqual(paths.slice().sort());
    expect(out.read.locales.map((l) => [l.locale, l.entries.map((e) => e.message)])).toEqual([["en", ["Home"]], ["ko", ["홈"]]]);
  });

  it("기준 언어를 주지 않으면 거부한다 — en 우선 추정이 `values/`의 실제 언어와 무관한 코드를 고른다(design §2.4)", () => {
    expect(() => assemblePushInput({ paths, probe, format: { ...detected, locales: [...detected.locales, "en"] } })).toThrow(/base locale/);
  });
});
