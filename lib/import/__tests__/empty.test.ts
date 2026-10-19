import { describe, expect, it } from "vitest";
import type { AdapterName } from "@/lib/adapters/types";
import { verifyEmptyCatalog } from "../empty";

const fixtures: { adapter: AdapterName; pathTemplate: string; paths: string[]; empty: string; invalid: string[] }[] = [
  { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", paths: ["i18n/en.json", "i18n/ko.json"], empty: "{}", invalid: ["{", "[]", "null", '{"hello":"Hello"}', '{"hello":null}'] },
  { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", paths: ["_locales/en/messages.json", "_locales/ko/messages.json"], empty: "{}", invalid: ["{", "[]", "null", '{"hello":{"message":"Hello"}}'] },
  { adapter: "yaml-catalog", pathTemplate: "i18n/{locale}.yml", paths: ["i18n/en.yml", "i18n/ko.yml"], empty: "{}", invalid: ["{", "[]", "", "hello: Hello", "hello: *missing", "? [foo, bar]\n: Hello", "hello: null"] },
  { adapter: "code-dict", pathTemplate: "i18n/{locale}.ts", paths: ["i18n/en.ts", "i18n/ko.ts"], empty: "export default {} as const;", invalid: ["export default {", "export default [];", "export default makeMessages();", 'export default { hello: "Hello" };'] },
  // `@@*`·`@key`만 있는 ARB는 엔트리가 0개인 카탈로그다. 문자열이 아닌 엔트리 값은 read가 오류로 알리므로 빈 카탈로그가 아니다.
  { adapter: "arb-catalog", pathTemplate: "lib/l10n/app_{locale}.arb", paths: ["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb"], empty: '{\n  "@@locale": "en",\n  "@stray": {}\n}\n', invalid: ["{", "[]", "null", '{"hello":"Hello"}', '{"hello":null}', '{"hello":{"x":"y"}}'] },
  // 주석만 있는 `.strings`는 엔트리가 0개인 카탈로그다. 바이너리 plist·문법 오류는 read가 오류로 알린다.
  { adapter: "apple-strings", pathTemplate: "App/{locale}.lproj/Localizable.strings", paths: ["App/en.lproj/Localizable.strings", "App/ko.lproj/Localizable.strings"], empty: "/* No strings yet */\n", invalid: ['"hello" = "Hello";', '"hello" = ', "bplist00\u0000\u0001", "{ }"] },
  { adapter: "ts-dict", pathTemplate: "i18n/*.ts", paths: ["i18n/common.ts"], empty: "const en = {} as const; const ko = {}; export const common = { en, ko };", invalid: ["const en = {", "const en = []; const ko = [];", "export default {};", 'const en = { hello: "Hello" }; const ko = {};'] },
];

describe("verifyEmptyCatalog", () => {
  for (const fixture of fixtures) {
    const input = () => ({ stored: { adapter: fixture.adapter, pathTemplate: fixture.pathTemplate, baseLocale: "en", basePath: null }, paths: fixture.paths, blobs: new Map(fixture.paths.map(path => [path, fixture.empty])) });
    it(`${fixture.adapter} 정상 빈 컨테이너를 인식한다`, () => expect(verifyEmptyCatalog(input())).toBe(true));
    for (const invalid of fixture.invalid) it(`${fixture.adapter} 잘못된/비어있지 않은 컨테이너 ${invalid}는 거부한다`, () => {
      const value = input(); value.blobs.set(fixture.paths[0]!, invalid);
      expect(verifyEmptyCatalog(value)).toBe(false);
    });
    it(`${fixture.adapter} 대상 미발견·base 부재·다운로드 실패를 빈 성공으로 바꾸지 않는다`, () => {
      expect(verifyEmptyCatalog({ ...input(), paths: [] })).toBe(false);
      expect(verifyEmptyCatalog({ ...input(), stored: { ...input().stored, baseLocale: "fr" } })).toBe(false);
      const missing = input(); missing.blobs.delete(fixture.paths[0]!);
      expect(verifyEmptyCatalog(missing)).toBe(false);
    });
  }
});

/** BOM이 붙은 빈 `{}` — read는 BOM을 벗기는데(audit #57) 이 판정의 두 번째 `JSON.parse`가 벗기지 않아 던졌다(B7a r1). */
describe("verifyEmptyCatalog — BOM", () => {
  it("BOM이 붙은 빈 json-catalog를 빈 카탈로그로 인식하고 던지지 않는다", () => {
    const paths = ["i18n/en.json", "i18n/ko.json"];
    const input = { stored: { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", baseLocale: "en", basePath: null }, paths, blobs: new Map(paths.map(path => [path, "\uFEFF{}"])) };
    expect(verifyEmptyCatalog(input)).toBe(true);
  });
});
