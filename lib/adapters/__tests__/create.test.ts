import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { yamlCatalog } from "../yaml-catalog";
import { codeDict } from "../code-dict";
import { adapterErrorKind, type Adapter, type DetectedFormat, type LocaleEntry } from "../types";
import { compareKeys, nestEntries, keyStructure } from "../shared";

const entries: LocaleEntry[] = [
  { key: "settings.save", message: "Save \"it\"\\now\nNext", order: 0 },
  { key: "common.ok", message: "Done", order: 9 },
  { key: "empty", message: "", writeEmpty: true },
  { key: "gone", message: "GONE", orphaned: true },
];
function format(adapter: Adapter, representationSource?: string): DetectedFormat {
  return { adapter: adapter.name, pathTemplate: `locales/{locale}.${adapter === yamlCatalog ? "yml" : "ts"}`, locales: ["en"], representationSource };
}
function create(adapter: Adapter, source?: string, values = entries, baseLocale = "en", locale = "fr") {
  return adapter.create!(format(adapter, source), { locale, baseLocale, entries: values });
}
function roundtrip(adapter: Adapter, source: string, values = entries, baseLocale = "en", locale = "fr") {
  const fmt = format(adapter, source);
  const input = { locale, baseLocale, entries: values };
  const result = adapter.create!(fmt, input);
  expect(result.errors).toEqual([]);
  expect(result.content).not.toBeNull();
  const content = result.content!;
  expect(adapter.create!(fmt, { ...input, entries: [...values].reverse() })).toEqual(result);
  expect(adapter.create!(fmt, input)).toEqual(result);
  const files = [{ path: fmt.pathTemplate.replaceAll("{locale}", locale), content }];
  expect(adapter.writeWithErrors!({ ...fmt, currentFiles: files }, input)).toEqual(result);
  const read = adapter.read(fmt, files);
  expect(read.errors).toEqual([]);
  expect(read.locales[0]?.entries).toEqual(values.filter(e => e.message !== "" && !e.orphaned).map(({ key, message }) => ({ key, message })).sort((a, b) => compareKeys(a.key, b.key)));
  expect(content.endsWith("\n")).toBe(true);
  expect(content.endsWith("\n\n")).toBe(false);
  expect(content).not.toContain("BASE_ONLY");
  return content;
}
function fails(adapter: Adapter, source: string | undefined, values = entries, code = "write-create-unsupported", baseLocale = "en") {
  const result = create(adapter, source, values, baseLocale);
  expect(result.content).toBeNull();
  expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code, path: format(adapter).pathTemplate.replaceAll("{locale}", "fr") })]));
  expect(result.errors.every(e => adapterErrorKind(e.code) === "failure")).toBe(true);
}

describe("새 파일 공유 계약", () => {
  it("Map 중첩은 정수 키도 코드 유닛 순서이고 프로토타입 키를 보존한다", () => {
    const result = nestEntries([{ key: "2.x", message: "two" }, { key: "10.x", message: "ten" }, { key: "__proto__.x", message: "safe" }], ".");
    expect([...result.tree.keys()]).toEqual(["10", "2", "__proto__"]);
    expect(result.tree.get("__proto__")).toEqual(new Map([["x", "safe"]]));
    expect(result.shadowed).toEqual([]);
  });
  it("중첩의 각 단계도 키 순서로 정렬한다", () => {
    const { tree } = nestEntries([{ key: "a-b", message: "dash" }, { key: "a.z", message: "last" }, { key: "a.10", message: "ten" }, { key: "a.2", message: "two" }], ".");
    expect([...tree.keys()]).toEqual(["a", "a-b"]);
    expect(tree.get("a")).toEqual(new Map([["10", "ten"], ["2", "two"], ["z", "last"]]));
  });
  it("접두 충돌은 깊은 키를 보존하고 얕은 키를 보고한다", () => {
    const values = [{ key: "a.b", message: "short" }, { key: "a.b.c", message: "deep" }];
    expect(nestEntries(values, ".")).toEqual({ tree: new Map([["a", new Map([["b", new Map([["c", "deep"]])]])]]), shadowed: ["a.b"] });
    expect(nestEntries([...values].reverse(), ".")).toEqual(nestEntries(values, "."));
  });
  it("최상위 점 키와 맵 유무로 평평·중첩·혼합을 가른다", () => {
    expect(keyStructure([{ key: "a.b", map: false }], ".")).toBe("flat");
    expect(keyStructure([{ key: "a", map: true }], ".")).toBe("nested");
    expect(keyStructure([{ key: "a.b", map: false }, { key: "c", map: true }], ".")).toBe("nested");
    expect(keyStructure([], ".")).toBe("nested");
  });
  for (const adapter of [yamlCatalog, codeDict]) {
    it(`${adapter.name}: 기준 파일 없음·파싱 실패·접두 충돌은 blocking이다`, () => {
      fails(adapter, undefined);
      fails(adapter, adapter === yamlCatalog ? "x: [" : "export default { x: '", entries, "write-parse-failed");
      fails(adapter, adapter === yamlCatalog ? "en:\n  common:\n    ok: BASE_ONLY\n" : "export default { common: { ok: 'BASE_ONLY' } };", [{ key: "a.b", message: "short" }, { key: "a.b.c", message: "deep" }], "key-shadowed");
    });
    it(`${adapter.name}: 중첩에서 앞 점을 잃는 키는 차단하고 평평한 리터럴은 보존한다`, () => {
      const nested = adapter === yamlCatalog ? 'common:\n  ok: BASE_ONLY\n".x": BASE_ONLY\n' : 'export default { common: { ok: "BASE_ONLY" }, ".x": "BASE_ONLY" };';
      fails(adapter, nested, [{ key: ".x", message: "Value" }]);
      const flat = adapter === yamlCatalog ? '".x": BASE_ONLY\n' : 'export default { ".x": "BASE_ONLY" };';
      roundtrip(adapter, flat, [{ key: ".x", message: "Value" }]);
    });
    it(`${adapter.name}: 다음 write의 새 부모 경로는 기존 점 리터럴 삽입 계약을 따른다`, () => {
      const source = adapter === yamlCatalog ? "en:\n  common:\n    ok: BASE_ONLY\n" : "export default { common: { ok: 'BASE_ONLY' } };";
      const first = [{ key: "common.ok", message: "Done" }];
      const content = roundtrip(adapter, source, first);
      const fmt = format(adapter, source);
      const path = fmt.pathTemplate.replaceAll("{locale}", "fr");
      const entries = [...first, { key: "missingParent.child", message: "New" }];
      const next = adapter.writeWithErrors!({ ...fmt, currentFiles: [{ path, content }] }, { locale: "fr", entries });
      expect(next.errors).toEqual([]);
      expect(next.content).toContain("missingParent.child");
      const currentFiles = [{ path, content: next.content! }];
      expect(adapter.read(fmt, currentFiles).locales[0]?.entries).toEqual(entries);
      expect(adapter.writeWithErrors!({ ...fmt, currentFiles }, { locale: "fr", entries })).toEqual(next);
    });
    it(`${adapter.name}: 값 0개는 의도된 빈 결과다`, () => {
      expect(create(adapter, undefined, entries.slice(2))).toEqual({ content: null, errors: [] });
    });
  }
});

describe("YAML 새 언어 파일", () => {
  it("Rails 루트와 4칸·CRLF·BOM을 따르고 read와 다음 write가 같다", () => {
    const out = roundtrip(yamlCatalog, "\uFEFFen:\r\n    common:\r\n        ok: BASE_ONLY\r\n");
    expect(out).toBe('\uFEFFfr:\r\n    common:\r\n        ok: Done\r\n    settings:\r\n        save: "Save \\\"it\\\"\\\\now\\nNext"\r\n');
  });
  it("루트 없는 중첩·혼합과 평평한 점 키 규약을 따른다", () => {
    expect(roundtrip(yamlCatalog, "common:\n  ok: BASE_ONLY\nsettings:\n  save: BASE_ONLY\n")).toContain("common:\n  ok: Done");
    expect(roundtrip(yamlCatalog, "common.ok: BASE_ONLY\nsettings.save: BASE_ONLY\n")).toContain("common.ok: Done");
    expect(roundtrip(yamlCatalog, "common.ok: BASE_ONLY\nsettings:\n  save: BASE_ONLY\n")).toContain("common:\n  ok: Done");
  });
  it("루트 불일치와 새 파일의 루트 오인을 막는다", () => {
    fails(yamlCatalog, "en:\n  common: BASE_ONLY\n", entries, "write-create-unsupported", "en-US");
    for (const key of ["nav", "app", "no"]) fails(yamlCatalog, "common: BASE_ONLY\nother: BASE_ONLY\n", [{ key: `${key}.ok`, message: "Done" }]);
  });
  it("노르웨이어 루트와 YAML 1.1 모호 키·값을 인용한다", () => {
    const values = [{ key: "yes", message: "No" }, { key: "clock", message: "12:30" }, { key: "on", message: "on" }];
    const out = roundtrip(yamlCatalog, "en:\n  seed: BASE_ONLY\n", values, "en", "no");
    expect(out).toContain('"no":');
    expect(out).toContain('"yes": "No"');
    expect(out).toContain('clock: "12:30"');
    expect(parseDocument(out, { version: "1.1" }).toJS()).toEqual({ no: { clock: "12:30", on: "on", yes: "No" } });
  });
  it("no 기준 루트·평평한 접두 키도 읽기와 쓰기가 같다", () => {
    roundtrip(yamlCatalog, "no:\n  seed: BASE_ONLY\n", entries, "no");
    roundtrip(yamlCatalog, "a.b: BASE_ONLY\n", [{ key: "a.b", message: "short" }, { key: "a.b.c", message: "deep" }]);
  });
  it("작은따옴표 파일에서도 개행 값은 큰따옴표이고 프로토타입 키를 보존한다", () => {
    const out = roundtrip(yamlCatalog, "en:\n  seed: 'BASE_ONLY'\n", [{ key: "__proto__.x", message: "a\nb" }]);
    expect(out).toContain('x: "a\\nb"');
  });
});

describe("code-dict 새 언어 파일", () => {
  it("중첩·4칸·CRLF·값과 키의 다른 인용·끝 쉼표를 따른다", () => {
    const out = roundtrip(codeDict, '\uFEFFexport default {\r\n    "common": {\r\n        "ok": \'BASE_ONLY\',\r\n    },\r\n};\r\n');
    expect(out.startsWith("export default {\r\n")).toBe(true);
    expect(out).toContain('    "common": {\r\n        "ok": \'Done\',\r\n    },');
    expect(out).not.toContain("\uFEFF");
  });
  it("평평한 점 키와 접두 리터럴 키는 그대로 쓴다", () => {
    const values = [{ key: "a.b", message: "short" }, { key: "a.b.c", message: "deep" }];
    const out = roundtrip(codeDict, 'export default { "common.ok": "BASE_ONLY" };', values);
    expect(out).toContain('"a.b": "short"');
    expect(out).toContain('"a.b.c": "deep"');
  });
  it("named export는 같은 이름이고 const 경유·래핑은 최소 default다", () => {
    expect(roundtrip(codeDict, "export const translations = { common: { ok: 'BASE_ONLY' } };")).toMatch(/^export const translations = /);
    for (const source of ["const x = { common: { ok: 'BASE_ONLY' } }; export default x;", "export default { common: { ok: 'BASE_ONLY' } } as const;", "export default ({ common: { ok: 'BASE_ONLY' } } satisfies Catalog);"]) {
      expect(roundtrip(codeDict, source)).toMatch(/^export default /);
    }
  });
  it("확장자에 관계없이 같은 모듈이며 기존 write로 편집해도 다시 읽힌다", () => {
    const source = "export const translations = { seed: 'BASE_ONLY' };";
    const content = roundtrip(codeDict, source);
    for (const ext of ["js", "mjs", "ts", "tsx"]) {
      const fmt = { ...format(codeDict, source), pathTemplate: `locales/{locale}.${ext}` };
      const result = codeDict.create!(fmt, { locale: "fr", baseLocale: "en", entries });
      expect(result.content).toBe(content);
      const files = [{ path: `locales/fr.${ext}`, content }];
      const edited = [{ key: "common.ok", message: "New \"value\"\\path\nNext" }];
      const written = codeDict.writeWithErrors!({ ...fmt, currentFiles: files }, { locale: "fr", entries: edited });
      expect(written.errors).toEqual([]);
      expect(codeDict.read(fmt, [{ ...files[0]!, content: written.content! }]).locales[0]?.entries).toContainEqual(edited[0]);
    }
  });
  it("기준 코드가 든 export 이름은 대소문자·구분자를 무시해 거부한다", () => {
    fails(codeDict, "export const koTranslations = { seed: 'BASE_ONLY' };", entries, "write-create-unsupported", "ko");
    fails(codeDict, "export const KO_kr = { seed: 'BASE_ONLY' };", entries, "write-create-unsupported", "ko-KR");
  });
  it("객체가 없으면 기본 표현으로 만들되 구문 오류는 거부한다", () => {
    expect(roundtrip(codeDict, "export default makeCatalog();")).toMatch(/^export default /);
  });
  it("식별자·하이픈·숫자 키와 탭·쉼표 없음을 보존한다", () => {
    const out = roundtrip(codeDict, "export default {\n\tseed: 'BASE_ONLY'\n};", [{ key: "valid", message: "V" }, { key: "has-dash", message: "D" }, { key: "1key", message: "N" }]);
    expect(out).toBe("export default {\n\t'1key': 'N',\n\t'has-dash': 'D',\n\tvalid: 'V'\n};\n");
  });
  it("중첩 __proto__는 실패하고 평평한 리터럴 안의 부분문자열은 안전하다", () => {
    for (const key of ["__proto__", "deep.__proto__.x"]) fails(codeDict, "export default { seed: 'BASE_ONLY' };", [{ key, message: "unsafe" }]);
    roundtrip(codeDict, "export default { 'a.b': 'BASE_ONLY' };", [{ key: "deep.__proto__.x", message: "safe" }]);
  });
});
