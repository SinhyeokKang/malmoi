import { expect, it } from "vitest";
import { planDelivery, projectFormats, type PullState } from "../run";

const edit = { id: "t", token: "token", cell: { surfaceId: "s", keyId: "k", localeCode: "en", restoreValue: "" } };
function input(cells: Record<string, { value: string }>) {
  const surfaces: PullState["surfaces"] = [{ id: "s", slug: "web", adapterName: "ts-dict", pathTemplate: "dict/*.ts", baseLocale: "en",
    nested: null, nestedByPath: {}, localeCodes: ["en"], keys: [{ id: "k", key: "hello", sourceText: "", orphaned: false, cells }] }];
  return { resolved: projectFormats(surfaces).map(item => ({ ...item, paths: [{ path: "dict/actual.ts" }] })),
    current: new Map([["dict/actual.ts", 'const en = { hello: "Previous" };']]), rendered: [] };
}
it("빈값 경고는 glob 템플릿 대신 해석된 실제 파일 경로를 쓴다", () => {
  expect(planDelivery([edit], input({ en: { value: "" } })).warnings).toEqual([
    { surfaceSlug: "web", path: "dict/actual.ts", key: "hello", code: "write-empty-unsupported" },
  ]);
});
it("상속된 로케일 셀은 빈 편집으로 읽지 않는다", () => {
  expect(planDelivery([edit], input(Object.create({ en: { value: "" } }))).warnings).toEqual([]);
});
it("키 자리 없는 빈 편집은 전체 경고가 아니라 셀 보류다", () => {
  const data = input({ en: { value: "" } });
  data.current.set("dict/actual.ts", 'const en = { other: "Other" };');
  expect(planDelivery([edit], data)).toMatchObject({ warnings: [], split: { delivered: [], withheld: [edit], withheldBy: { key: 1 } } });
});
