import { describe, expect, it } from "vitest";
import { localesToKeep } from "../locales";

/**
 * **재탐지 로케일에 다운로드 실패 로케일을 되살린다** (delivery-invariants D6 · 감사 #59). 재탐지는 첫 다운로드분만 보고
 * 재시도는 blob만 채워서, fr blob 한 번의 일시 실패가 fr을 `payload.locales`에서 빼고 적재가 fr을 orphan시켰다.
 * 경로는 **트리**에서 온다(`attempted`) — 성공한 다운로드가 아니다.
 */
describe("localesToKeep", () => {
  const format = { adapter: "json-catalog" as const, pathTemplate: "locales/{locale}.json", locales: ["en", "ko"] };
  const attempted = ["locales/en.json", "locales/fr.json", "locales/ko.json"];

  it("첫 시도에서 빠진 fr을 되살린다 — 재시도 성공이든 실패든 목록에 남는다", () => {
    expect(localesToKeep({ format, layout: "per-locale", attempted })).toEqual(["en", "fr", "ko"]);
  });

  it("템플릿에 없는 경로는 로케일을 만들지 않는다", () => {
    expect(localesToKeep({ format, layout: "per-locale", attempted: [...attempted, "extra/ja.json"] })).toEqual(["en", "fr", "ko"]);
  });

  it("multi-locale은 경로가 로케일을 말하지 않는다 — 재탐지 결과 그대로다", () => {
    const ts = { adapter: "ts-dict" as const, pathTemplate: "ns/*.ts", locales: ["ko", "en"] };
    expect(localesToKeep({ format: ts, layout: "multi-locale", attempted: ["ns/a.ts"] })).toEqual(["ko", "en"]);
  });
});
