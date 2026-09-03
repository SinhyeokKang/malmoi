import { describe, expect, it } from "vitest";
import { parseWrapperSpec, formatWrapperSpec } from "../wrapper";

describe("--wrapper 스펙 파싱", () => {
  it("<module>#<export>는 direct다", () => {
    expect(parseWrapperSpec("@/i18n#t")).toEqual({ module: "@/i18n", export: "t", kind: "direct" });
  });

  it("끝의 ()가 hook을 뜻한다 — 부른 결과가 실제 호출자다", () => {
    expect(parseWrapperSpec("next-intl#useTranslations()")).toEqual({
      module: "next-intl",
      export: "useTranslations",
      kind: "hook",
    });
  });

  it("경로에 #이 들어간 모듈은 마지막 #으로 가른다", () => {
    expect(parseWrapperSpec("next-intl/server#getTranslations()")).toMatchObject({
      module: "next-intl/server",
      export: "getTranslations",
    });
  });

  it("형식이 아니면 undefined다 — 호출부가 사용법을 낸다", () => {
    expect(parseWrapperSpec("t")).toBeUndefined();
    expect(parseWrapperSpec("#t")).toBeUndefined();
    expect(parseWrapperSpec("@/i18n#")).toBeUndefined();
    expect(parseWrapperSpec("@/i18n#()")).toBeUndefined();
    expect(parseWrapperSpec("")).toBeUndefined();
  });

  it("왕복한다 — 사람이 읽는 출력이 그대로 다시 파싱된다", () => {
    for (const spec of ["@/i18n#t", "next-intl#useTranslations()", "next-intl/server#getTranslations()"]) {
      expect(formatWrapperSpec(parseWrapperSpec(spec)!)).toBe(spec);
    }
  });
});
