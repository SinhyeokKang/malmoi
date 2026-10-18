import { expect, it } from "vitest";
import { renderLocaleFiles, type RenderKey } from "../render";
import { blockingErrors, withheldCoordinates } from "../undeliverable";

const keys: RenderKey[] = [{ key: "hello", sourceText: "Hello", orphaned: false, cells: { fr: { value: "Bonjour" } } }];
it.each([
  ["yaml-catalog", "yml", "en:\n  hello: Hello\n", "ko:\n  hello: Hello\n"],
  ["code-dict", "ts", "export default { hello: 'Hello' };\n", "export const en = { hello: 'Hello' };\n"],
])("%s 생성 실패는 언어 태그가 붙은 blocking, 비-ADD만 파일 보류다", (adapter, ext, source, invalid) => {
  const path = `fr.${ext}`;
  const format = { adapter, pathTemplate: `{locale}.${ext}`, locales: ["en", "fr"] };
  const render = (represent?: { locales: Set<string>; source: string | undefined }, entries = keys) =>
    renderLocaleFiles(format, "per-locale", [{ path, locale: "fr" }], entries, "en", new Map(), represent);
  const wrapped = (files: ReturnType<typeof render>) => [{ surfaceId: "s", surfaceSlug: "web", baseLocale: "en", files }];
  const add = { locales: new Set(["fr"]), source };
  expect(render(add)[0]?.content).toContain("Bonjour");
  expect(render(add)).toEqual(render(add));
  expect(render(add, [])[0]).toMatchObject({ content: null });
  expect(blockingErrors(wrapped(render(add, [])))).toEqual([]);
  expect(render()[0]).toMatchObject({ content: null, errors: [{ code: "original-file-missing", locale: "fr" }] });
  expect(withheldCoordinates(wrapped(render())).locales).toEqual(new Set(["s\0fr"]));
  for (const broken of [undefined, invalid]) {
    const files = render({ ...add, source: broken });
    expect(files[0]).toMatchObject({ content: null, errors: [{ code: "write-create-unsupported", locale: "fr", path }] });
    expect(blockingErrors(wrapped(files))).toHaveLength(1);
    expect(withheldCoordinates(wrapped(files)).locales.size).toBe(0);
  }
});
