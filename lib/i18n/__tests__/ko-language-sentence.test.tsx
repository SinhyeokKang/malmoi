import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ko } from "@/messages/ko";

const text = (node: React.ReactNode): string => renderToStaticMarkup(<>{node}</>).replace(/<!-- -->/g, "");

/**
 * Logs 문장의 언어 자리는 `languageName`이 낸 **언어 이름**(`프랑스어`)이다 — 거기에 "언어"를 또 붙이면
 * "프랑스어 언어의"가 된다. 코드를 받는 문장(`fr 언어는`)은 별개라 그대로다.
 */
describe("ko Logs 번역 문장 — 언어 이름 뒤에 '언어'를 겹치지 않는다", () => {
  const { updated, cleared, reverted } = ko.logs.sentence.translation;

  it.each([
    ["updated", updated, "홍길동 — 프랑스어의 greet 값을 수정했습니다"],
    ["cleared", cleared, "홍길동 — 프랑스어의 greet 값을 비웠습니다"],
    ["reverted", reverted, "홍길동 — 프랑스어의 greet 값을 마지막으로 보낸 것이 확인된 버전으로 되돌렸습니다"],
  ] as const)("%s", (_name, sentence, expected) => {
    expect(text(sentence("홍길동", "greet", "프랑스어"))).toBe(expected);
  });
});
