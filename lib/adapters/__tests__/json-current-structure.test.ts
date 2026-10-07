import { expect, it } from "vitest";
import { renderLocaleFiles } from "@/lib/pull/render";
import { jsonCatalog } from "../json-catalog";

it.each([
  [true, '{"hello.title":"Hi","hello":{"title":null}}', { "hello.title": "Edited" }],
  [true, '{"hello":{"0":"Hi"}}', { hello: { "0": "Edited" } }],
  [true, '{"":{"hello":"Hi"}}', { "": { hello: "Edited" } }],
  [false, '{"hello":"Hi","new":{"title":"New"}}', { hello: "Edited", new: { title: "New" } }],
  [true, '{"hello":{"title":"Hi"},"new.title":"New"}', { hello: { title: "Edited" }, "new.title": "New" }],
])("저장된 nested=%s보다 현재 원본의 각 키 경로를 보존한다", (nested, original, expected) => {
  const format = { adapter: "json-catalog" as const, pathTemplate: "locales/{locale}.json", locales: ["en"], nested,
    nestedByPath: { "locales/en.json": nested }, currentFiles: [{ path: "locales/en.json", content: original }] };
  const read = jsonCatalog.read(format, format.currentFiles);
  const entries = read.locales[0]!.entries.map(e => ({ ...e, message: e.key.startsWith("hello") ? "Edited" : e.message }));
  const result = jsonCatalog.writeWithErrors!(format, { locale: "en", entries });
  expect(result.errors).toEqual([]);
  expect(JSON.parse(result.content!)).toEqual(expected);
  const keys = read.locales[0]!.entries.filter(e => e.key.startsWith("hello")).map(e => ({
    key: e.key, sourceText: e.message, orphaned: false, cells: { en: { value: "Edited" } },
  }));
  const [rendered] = renderLocaleFiles(format, "per-locale", [{ path: "locales/en.json", locale: "en" }], keys, "en", new Map([["locales/en.json", original]]));
  expect(JSON.parse(rendered!.content!)).toEqual(expected);
  expect(jsonCatalog.writeWithErrors!(format, { locale: "en", entries })).toEqual(result);
});
