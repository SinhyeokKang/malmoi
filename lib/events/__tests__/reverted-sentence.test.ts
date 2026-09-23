import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { eventSentence } from "../view";

/**
 * **복원 사건의 문장** (translation-rework T11 — spec §3.6). `translation.reverted`는 저장과 같은 TRANSLATION 종류지만
 * 문장이 다르다 — "updated"로 읽히면 값을 되돌린 것과 새로 쓴 것이 Logs에서 구별되지 않는다.
 */
const payload = (after: string) => ({ kind: "TRANSLATION" as const, surfaceSlug: "web", key: "greet", locale: "ko", before: "새 값", after });

describe("eventSentence — translation.reverted", () => {
  it("복원은 reverted 문장이다 — 빈 값으로 되돌려도 cleared가 아니다", () => {
    const nodes = { actor: "Owner", key: "greet" };
    for (const after of ["안녕", ""]) {
      const sentence = eventSentence({ kind: "TRANSLATION", subtype: "translation.reverted", result: null, payload: payload(after) }, nodes);
      expect(sentence).toEqual(m.logs.sentence.translation.reverted("Owner", "greet", expect.any(String)));
    }
  });

  it("저장은 그대로 updated다 (위 대조)", () => {
    const nodes = { actor: "Editor", key: "greet" };
    const sentence = eventSentence({ kind: "TRANSLATION", subtype: "translation.saved", result: null, payload: payload("x") }, nodes);
    expect(sentence).not.toEqual(m.logs.sentence.translation.reverted("Editor", "greet", expect.any(String)));
  });
});
