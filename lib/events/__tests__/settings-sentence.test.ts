import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { eventSentence } from "../view";

/**
 * **프로젝트 이미지 삭제의 문장** (malmoi#124). 올림과 삭제는 다른 하위 종류로 기록되는데 같은 문장에
 * 매핑돼 Logs에서 삭제가 "changed"로 읽혔다.
 */
const text = (subtype: string) =>
  renderToStaticMarkup(eventSentence({ kind: "SETTINGS", subtype, result: null, payload: null }, { actor: "Owner", key: null }));

describe("eventSentence — settings.image*", () => {
  it("삭제는 removed 문장이다", () => {
    expect(text("settings.imageRemoved")).toBe("Owner removed the project image");
  });

  it("올림은 그대로 changed 문장이다 (위 대조)", () => {
    expect(text("settings.imageChanged")).toBe("Owner changed the project image");
  });
});
