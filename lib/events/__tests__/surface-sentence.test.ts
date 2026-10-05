import { en } from "@/messages/en";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { eventSentence, refusalMessage } from "../view";

/**
 * **소스 제거의 Logs 문장** (sources-add-remove B-T6). SURFACE 사건은 기준 언어 밖이 전부 `added`로 읽혀, 제거가 "added"로 그려졌다.
 * 되살림은 추가 사건 그대로라 문장이 같다.
 */
const text = (subtype: string) => renderToStaticMarkup(eventSentence(en, "en", {
  kind: "SURFACE", subtype, result: null,
  payload: { kind: "SURFACE", surfaceSlug: "web", adapter: "json-catalog", baseLocale: null },
}, { actor: "Owner", key: null }));

describe("eventSentence — surface.removed", () => {
  it("제거는 removed 문장이다", () => {
    expect(text("surface.removed")).toBe("Owner removed the web source");
  });

  it("추가·기준 언어는 그대로다 (위 대조)", () => {
    expect(text("surface.added")).toBe("Owner added the web source");
    expect(text("surface.baseLocaleDeclared")).toBe("Owner changed the base language of web");
  });
});

describe("refusalMessage — surface-removed", () => {
  it("제거된 소스로 온 CI의 거부는 워크플로 처방을 말한다", () => {
    expect(refusalMessage(en, "surface-removed")).toBe(en.logs.refusals["surface-removed"]);
    expect(refusalMessage(en, "surface-removed")).not.toBe(en.logs.refusals.fallback);
  });
});
