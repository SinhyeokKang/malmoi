import { describe, expect, it } from "vitest";
import { detectFormatWith } from "@/lib/adapters";
import { assemblePushInput } from "@/lib/push/assemble";
import { planConfirmedFormat } from "../confirm";
import { defaultBaseLocale, summarizeCandidates } from "../detect";
import { planBaseLocaleChange } from "../base-locale";

const basePath = "app/src/main/res/values/strings.xml";
const pathTemplate = "app/src/main/res/values-{locale}/strings.xml";
const files = [
  { path: basePath, content: '<resources><string name="title">English</string></resources>' },
  { path: pathTemplate.replace("{locale}", "de"), content: '<resources><string name="title">Deutsch</string></resources>' },
];
const paths = files.map(f => f.path);
const probe = (path: string) => files.find(f => f.path === path)?.content;
const detected = () => detectFormatWith("android-strings", paths, probe)!;

describe("Android 기준 언어 입력", () => {
  it("탐지는 기준 언어를 추정하지 않고 후보를 유지한다", () => {
    expect(defaultBaseLocale(detected())).toBeUndefined();
    expect(summarizeCandidates([detected()], new Map(files.map(f => [f.path, f.content])))[0]).toMatchObject({ baseLocale: "", basePath, locales: ["de"], keys: { status: "counted", count: 1 } });
  });
  it("입력한 코드가 values 파일의 언어가 되고 두 언어를 모두 적재한다", () => {
    const result = planConfirmedFormat({ adapter: "android-strings", pathTemplate, basePath, baseLocale: "en" }, files);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.format).toMatchObject({ templateLocale: "en", locales: ["de", "en"] });
    const assembled = assemblePushInput({ paths, probe, format: result.format, baseLocale: "en" });
    expect(assembled.read.locales.map(l => [l.locale, l.entries[0]?.message]).sort()).toEqual([["de", "Deutsch"], ["en", "English"]]);
  });
  it.each(["de", "", "../en", "english-language-name"])("관측 코드 또는 잘못된 코드 %s는 거부한다", baseLocale => {
    expect(planConfirmedFormat({ adapter: "android-strings", pathTemplate, basePath, baseLocale }, files)).toEqual({ status: "rejected", reason: "base-locale-missing" });
  });
  it("CLI의 탐지 포맷에도 명시 코드를 넣고 중복은 거부한다", () => {
    expect(() => assemblePushInput({ paths, probe, format: detected() })).toThrow(/--base.*base-locale/);
    expect(() => assemblePushInput({ paths, probe, format: detected(), baseLocale: "de" })).toThrow(/--base.*base-locale.*de/);
    const result = assemblePushInput({ paths, probe, format: detected(), baseLocale: "en" });
    expect(result.read.locales.map(l => l.locale).sort()).toEqual(["de", "en"]);
    expect(result.format).toMatchObject({ templateLocale: "en", locales: ["de", "en"] });
  });
  it("Android의 기준 언어 변경은 거부하되 같은 코드는 noop이다", () => {
    const common = { adapter: "android-strings", current: "en", locales: [{ code: "en", orphaned: false }, { code: "de", orphaned: false }] };
    expect(planBaseLocaleChange({ ...common, next: "de" })).toBe("android-base-fixed");
    expect(planBaseLocaleChange({ ...common, next: "en" })).toBe("noop");
  });
});
