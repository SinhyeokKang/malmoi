import { expect, it } from "vitest";
import { extractRefs } from "../ast";
import type { WrapperId } from "../types";

/**
 * `extractRefs`를 **직접** 부른다 (launch-readiness L4.8 — 전에는 `scanSources` 경유로만 지났다).
 * 파일 단위 판정 넷: import가 있어야 우리 래퍼다 · chrome 직접 호출은 import 없이 잡는다 · 비리터럴은 경고 ·
 * `@l10n-keys` 지시자가 그 경고를 대신한다.
 */
const T: WrapperId = { module: "@/i18n", export: "t", kind: "direct" };
const keys = (r: ReturnType<typeof extractRefs>) => r.found.map((f) => [f.key, f.ref.line]);

it("래퍼를 import한 파일의 리터럴 호출을 줄 번호와 함께 낸다", () => {
  const r = extractRefs("src/a.ts", 'import { t } from "@/i18n";\n\nt("a.one");\nt("a.two");\n', [T]);
  expect(keys(r)).toEqual([["a.one", 3], ["a.two", 4]]);
  expect(r.warnings).toEqual([]);
});

it("import가 없으면 같은 이름의 t()도 남의 것이다", () => {
  expect(extractRefs("src/a.ts", 't("a.one");\n', [T]).found).toEqual([]);
});

it("별칭 import를 따라간다", () => {
  const r = extractRefs("src/a.ts", 'import { t as tr } from "@/i18n";\ntr("a.one");\nt("not.ours");\n', [T]);
  expect(keys(r)).toEqual([["a.one", 2]]);
});

it("chrome.i18n.getMessage는 래퍼 없이도 잡는다", () => {
  expect(keys(extractRefs("src/bg.ts", 'chrome.i18n.getMessage("ext_name");\n', []))).toEqual([["ext_name", 1]]);
});

it("비리터럴 키는 경고하고, 위의 @l10n-keys 지시자가 있으면 경고하지 않는다", () => {
  const warned = extractRefs("src/a.ts", 'import { t } from "@/i18n";\nt(key);\n', [T]);
  expect(warned.found).toEqual([]);
  expect(warned.warnings).toEqual([expect.objectContaining({ path: "src/a.ts", line: 2 })]);
  const declared = extractRefs("src/a.ts", 'import { t } from "@/i18n";\n// @l10n-keys a, b\nt(key);\n', [T]);
  expect(declared.warnings).toEqual([]);
});
