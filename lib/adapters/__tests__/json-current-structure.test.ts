import { expect, it } from "vitest";
import { jsonCatalog } from "../json-catalog";

it.each([
  [false, '{"hello":"Hi","new":{"title":"New"}}', { hello: "Edited", new: { title: "New" } }],
  [true, '{"hello":{"title":"Hi"},"new.title":"New"}', { hello: { title: "Edited" }, "new.title": "New" }],
])("저장된 nested=%s보다 현재 원본의 각 키 경로를 보존한다", (nested, original, expected) => {
  const format = { adapter: "json-catalog", pathTemplate: "locales/{locale}.json", locales: ["en"], nested,
    nestedByPath: { "locales/en.json": nested }, currentFiles: [{ path: "locales/en.json", content: original }] };
  const read = jsonCatalog.read(format, format.currentFiles);
  const entries = read.locales[0]!.entries.map(e => ({ ...e, message: e.key.startsWith("hello") ? "Edited" : e.message }));
  const result = jsonCatalog.writeWithErrors!(format, { locale: "en", entries });
  expect(result.errors).toEqual([]);
  expect(JSON.parse(result.content!)).toEqual(expected);
  expect(jsonCatalog.writeWithErrors!(format, { locale: "en", entries })).toEqual(result);
});
