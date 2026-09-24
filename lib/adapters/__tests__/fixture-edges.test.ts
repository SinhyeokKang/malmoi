import { describe, expect, it } from "vitest";

import { adapterErrorKind, chromeLocales, codeDict, jsonCatalog, tsDict, yamlCatalog } from "../index";
import type { DetectedFormat } from "../types";

/**
 * **픽스처 편향 두 축** (audit #74). 감사 시점에 빈 파일 픽스처는 YAML에만 있었고 백틱 인용은 0이었다 —
 * 그 둘은 실제 리포에서 흔히 만나는 입력인데 어느 어댑터가 어떻게 답하는지 고정한 자리가 없었다.
 * 여기는 **지금 동작을 고정한다** — 바꾸려면 이 단언을 먼저 뒤집는다.
 *
 * 각 "안 읽힌다" 단언 옆에 같은 파일 묶음의 정상 파일이 읽히는 짝을 둔다 (POSTMORTEM 2026-09-14).
 */

const json = (over: Partial<DetectedFormat> = {}): DetectedFormat =>
  ({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "ko"], ...over });

describe("빈 파일 — 로케일 하나가 0바이트다", () => {
  it("json-catalog: 빈 파일은 parse-failed(실패)이고 형제 파일은 그대로 읽힌다", () => {
    const got = jsonCatalog.read(json(), [
      { path: "i18n/ko.json", content: "" },
      { path: "i18n/en.json", content: '{"a":"A"}' },
    ]);
    expect(got.errors).toEqual([expect.objectContaining({ path: "i18n/ko.json", code: "parse-failed" })]);
    expect(adapterErrorKind("parse-failed")).toBe("failure");
    expect(got.locales).toEqual([{ locale: "en", entries: [expect.objectContaining({ key: "a", message: "A" })] }]);
  });

  it("chrome-locales: 빈 messages.json도 parse-failed다", () => {
    const got = chromeLocales.read(
      { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", locales: ["en", "ko"] },
      [
        { path: "_locales/ko/messages.json", content: "" },
        { path: "_locales/en/messages.json", content: '{"a":{"message":"A"}}' },
      ],
    );
    expect(got.errors).toEqual([expect.objectContaining({ path: "_locales/ko/messages.json", code: "parse-failed" })]);
    expect(got.locales.map((l) => l.locale)).toEqual(["en"]);
  });

  it("yaml-catalog: 빈 문서는 root-not-object다 — JSON과 코드가 다르다", () => {
    const got = yamlCatalog.read(
      { adapter: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml", locales: ["en", "ko"] },
      [
        { path: "config/locales/ko.yml", content: "" },
        { path: "config/locales/en.yml", content: "en:\n  a: A\n" },
      ],
    );
    expect(got.errors).toEqual([expect.objectContaining({ path: "config/locales/ko.yml", code: "root-not-object" })]);
    expect(got.locales.map((l) => l.locale)).toEqual(["en"]);
  });

  /**
   * ⚠️ **ts-dict는 빈 파일을 오류로 보지 않는다** — 파일 하나가 네임스페이스 하나이고 로케일은 파일 **안의**
   * 선언이라, 선언이 0인 파일은 "아무 로케일에도 기여하지 않는다"로 읽힌다. 다른 파일의 로케일이 사라지지 않는다.
   */
  it("ts-dict: 빈 .ts는 오류도 로케일도 없고, 다른 네임스페이스는 그대로 읽힌다", () => {
    const format: DetectedFormat = { adapter: "ts-dict", pathTemplate: "src/i18n/namespaces/*.ts", locales: ["ko"] };
    expect(tsDict.read(format, [{ path: "src/i18n/namespaces/empty.ts", content: "" }])).toEqual({ locales: [], errors: [], nested: false });
    const got = tsDict.read(format, [
      { path: "src/i18n/namespaces/empty.ts", content: "" },
      { path: "src/i18n/namespaces/common.ts", content: 'const ko = { "a": "확인" };\nexport const common = { ko };\n' },
    ]);
    expect(got.errors).toEqual([]);
    expect(got.locales).toEqual([{ locale: "ko", entries: [{ key: "a", message: "확인" }] }]);
  });
});

/**
 * **백틱(치환 없는 템플릿 리터럴)은 관리 밖이다.** 수술적 치환이 쓸 수 있는 부호가 `'`·`"` 둘뿐이라
 * (`quote-style.ts`) 읽기에서 그 키를 `value-not-string-literal`로 알리고, 쓰기는 그 자리를 건드리지 않는다.
 * 같은 파일의 따옴표 키는 평소처럼 읽히고 치환된다.
 */
describe("백틱 인용 값", () => {
  const TS = 'const ko = {\n  "a": `확인`,\n  "b": "닫기",\n};\nexport const common = { ko };\n';
  const tsFormat: DetectedFormat = { adapter: "ts-dict", pathTemplate: "src/i18n/namespaces/*.ts", locales: ["ko"] };

  it("ts-dict read: 백틱 키만 unmanaged로 빠지고 따옴표 키는 읽힌다", () => {
    const got = tsDict.read(tsFormat, [{ path: "src/i18n/namespaces/common.ts", content: TS }]);
    expect(got.errors).toEqual([expect.objectContaining({ code: "value-not-string-literal", key: "a", detail: "NoSubstitutionTemplateLiteral" })]);
    expect(adapterErrorKind("value-not-string-literal")).toBe("unmanaged");
    expect(got.locales).toEqual([{ locale: "ko", entries: [{ key: "b", message: "닫기" }] }]);
  });

  it("ts-dict write: 백틱 자리는 그대로 두고 알리며, 따옴표 자리는 치환한다", () => {
    const got = tsDict.writeWithErrors!(
      { ...tsFormat, currentFiles: [{ path: "src/i18n/namespaces/common.ts", content: TS }] },
      { locale: "ko", entries: [{ key: "a", message: "새", order: 0 }, { key: "b", message: "닫기2", order: 1 }] },
    );
    expect(got.content).toBe('const ko = {\n  "a": `확인`,\n  "b": "닫기2",\n};\nexport const common = { ko };\n');
    expect(got.errors).toEqual([expect.objectContaining({ code: "value-not-string-literal", key: "a" })]);
  });

  it("code-dict read: 백틱 값도 unmanaged로 빠지고 따옴표 값은 읽힌다", () => {
    const got = codeDict.read(
      { adapter: "code-dict", pathTemplate: "src/locale/{locale}.ts", locales: ["ko"] },
      [{ path: "src/locale/ko.ts", content: "export default {\n  ok: `확인`,\n  close: '닫기',\n}\n" }],
    );
    expect(got.errors).toEqual([expect.objectContaining({ code: "value-not-string-literal", key: "ok" })]);
    expect(got.locales).toEqual([{ locale: "ko", entries: [expect.objectContaining({ key: "close", message: "닫기" })] }]);
  });
});
