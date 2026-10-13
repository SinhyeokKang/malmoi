import { en } from "@/messages/en";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { eventSentence } from "../view";

/**
 * **프로젝트 이미지 삭제의 문장** (malmoi#124). 올림과 삭제는 다른 하위 종류로 기록되는데 같은 문장에
 * 매핑돼 Logs에서 삭제가 "changed"로 읽혔다.
 */
const text = (subtype: string) =>
  renderToStaticMarkup(eventSentence(en, "en", { kind: "SETTINGS", subtype, result: null, payload: null }, { actor: "Owner", key: null }));

describe("eventSentence — settings.image*", () => {
  it("삭제는 removed 문장이다", () => {
    expect(text("settings.imageRemoved")).toBe("Owner removed the project image");
  });

  it("올림은 그대로 changed 문장이다 (위 대조)", () => {
    expect(text("settings.imageChanged")).toBe("Owner changed the project image");
  });
});

/**
 * **GitLab 연결 참조가 빈 사건** (gitlab-repositories D20 — `settings.repositoryDisconnected`). 연결자가 계정의 GitLab 연결을 해제했거나 프로젝트에서
 * 빠지면 같은 tx에서 남는다. 문장이 없으면 settings 폴백("changed Settings")으로 떨어져 Logs가 끊김을 말하지 못한다.
 */
describe("eventSentence — settings.repositoryDisconnected (D20)", () => {
  it("GitLab 연결을 해제했다고 말하고 폴백이 아니다", () => {
    expect(text("settings.repositoryDisconnected")).toBe("Owner removed the GitLab connection this project used");
  });
});
