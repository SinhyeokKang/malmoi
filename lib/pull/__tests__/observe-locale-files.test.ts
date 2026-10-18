import { expect, it } from "vitest";
import { observeLocaleFiles } from "../locales";

it.each([
  ["yaml-catalog", "config/{locale}.yml"],
  ["yaml-catalog", "locales/{locale}/common.yml"],
  ["code-dict", "src/locales/{locale}.ts"],
])("%s %s 관측은 정규 파일만 세며 모르는 mode는 보류한다", (adapterName, pathTemplate) => {
  const surface = { adapterName, pathTemplate };
  const path = (locale: string) => pathTemplate.replace("{locale}", locale);
  expect(observeLocaleFiles([
    { path: path("ko"), mode: "100755" }, { path: path("en"), mode: "100644" },
    { path: path("fr"), mode: "120000" }, { path: path("de"), mode: "160000" },
    { path: "unrelated.txt" },
  ], surface)).toEqual({ status: "observed", locales: ["en", "ko"] });
  expect(observeLocaleFiles([{ path: path("fr") }], surface)).toEqual({ status: "unreadable" });
  expect(observeLocaleFiles([], surface)).toEqual({ status: "observed", locales: [] });
});
