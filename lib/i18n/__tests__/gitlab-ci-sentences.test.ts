import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * **GitLab CI가 읽는 사실을 문장이 그대로 말한다** (gitlab-repositories 감사 런).
 *
 * - 연결이 끊긴(참조 비움·저장 만료·철회) GitLab 프로젝트의 CI 보류(`pr-check-failed`)는 재연결 전까지 풀리지 않는다 — 야간 대상에서도 빠진다.
 *   그래서 Logs 문장은 "다음 실행이 다시 본다"만 말하지 않고 설정의 재연결을 말한다(결정 R3 — 판정·사유 값은 그대로). 그 경우 GitLab을 부르지도
 *   않았으므로 "GitLab이 응답하지 않았다"고 단언하지 않는다.
 */
const DICTIONARIES: [string, Messages, { reconnect: RegExp; settings: string; noAnswer: RegExp }][] = [
  ["en", en, { reconnect: /reconnect/i, settings: "Settings", noAnswer: /didn.t answer/i }],
  ["ko", ko, { reconnect: /다시 연결/, settings: "설정", noAnswer: /응답하지/ }],
  ["es", es, { reconnect: /volver a conectar/i, settings: "Configuración", noAnswer: /no respondió/i }],
];

const text = (node: ReactNode): string => (isValidElement(node) ? renderToStaticMarkup(node).replace(/<[^>]+>/g, "") : String(node));

describe.each(DICTIONARIES)("%s — GitLab 열린 MR 조회 실패 보류", (_lang, m, words) => {
  it("Logs 사유 문장이 연결이 끊긴 경우의 재연결(설정)을 말한다", () => {
    const sentence = m.logs.onGitLab.deferReasons["pr-check-failed"];
    expect(sentence).toMatch(words.reconnect);
    expect(sentence).toContain(words.settings);
  });

  it("Logs 행 문장이 GitLab이 응답하지 않았다고 단언하지 않는다 — 끊긴 연결이면 GitLab을 부르지 않았다", () => {
    expect(text(m.logs.onGitLab.sentence.import.held["pr-check-failed"]("A"))).not.toMatch(words.noAnswer);
  });
});
