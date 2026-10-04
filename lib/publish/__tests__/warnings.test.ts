import { describe, expect, it } from "vitest";

import type { PullWarning } from "@/lib/pull/run";
import { summarizeWarnings } from "../warnings";

/**
 * Publish 모달의 "보내지 않은 항목" 목록 — 실행은 경고를 **코드**로 싣고(`PullWarning`, ui-locales B1′) 문장은 화면이 조립한다.
 * 그래서 이 함수는 문장을 파싱하지 않고 `surfaceSlug: path`로 묶기만 하며, 문장은 받은 함수가 만든다(화면 언어의 사전).
 */
describe("summarizeWarnings", () => {
  const w = (surfaceSlug: string, path: string, code: PullWarning["code"], key?: string): PullWarning => ({ surfaceSlug, path, code, ...(key === undefined ? {} : { key }) });

  it("표면·파일마다 한 묶음이고 순서는 처음 나온 순서다", () => {
    const groups = summarizeWarnings(
      [w("web", "ko.json", "value-not-string", "a"), w("app", "en.yml", "root-not-object"), w("web", "ko.json", "value-not-string", "b")],
      (warning) => `${warning.code}:${warning.key ?? ""}`,
    );
    expect(groups).toEqual([
      { file: "web: ko.json", messages: ["value-not-string:a", "value-not-string:b"] },
      { file: "app: en.yml", messages: ["root-not-object:"] },
    ]);
  });

  it("같은 경로라도 표면이 다르면 다른 묶음이다", () => {
    const groups = summarizeWarnings([w("web", "en.json", "root-not-object"), w("app", "en.json", "root-not-object")], (warning) => warning.code);
    expect(groups.map((g) => g.file)).toEqual(["web: en.json", "app: en.json"]);
  });

  it("문장은 받은 함수가 만든다 — 사전 언어를 이 함수가 고르지 않는다", () => {
    const [group] = summarizeWarnings([w("web", "ko.json", "root-not-object")], () => "translated");
    expect(group?.messages).toEqual(["translated"]);
  });
});
